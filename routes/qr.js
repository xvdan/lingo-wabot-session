const { 
    lingoId,
    removeFile
} = require('../lingo');
const QRCode = require('qrcode');
const express = require('express');
const zlib = require('zlib');
const path = require('path');
const fs = require('fs');
let router = express.Router();
const pino = require("pino");
const { sendButtons } = require('gifted-btns');

// Dynamic import for Baileys (ES Module fix)
let lingoConnect, useMultiFileAuthState, Browsers, delay, 
    fetchLatestBaileysVersion, makeCacheableSignalKeyStore;

// Initialize Baileys immediately
const initBaileys = async () => {
    try {
        const baileys = await import("@whiskeysockets/baileys");
        lingoConnect = baileys.default;
        useMultiFileAuthState = baileys.useMultiFileAuthState;
        Browsers = baileys.Browsers;
        delay = baileys.delay;
        fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
        makeCacheableSignalKeyStore = baileys.makeCacheableSignalKeyStore;
        console.log("✅ Baileys imported successfully in qr.js");
        return true;
    } catch (error) {
        console.error("❌ Failed to import Baileys in qr.js:", error);
        return false;
    }
};

// Call the initialization
initBaileys();

const sessionDir = path.join(__dirname, "lingo-session");

router.get('/', async (req, res) => {
    const id = lingoId();
    let responseSent = false;
    let sessionCleanedUp = false;

    async function cleanUpSession() {
        if (!sessionCleanedUp) {
            await removeFile(path.join(sessionDir, id));
            console.log(`✅ QR session cleaned up: ${id}`);
            sessionCleanedUp = true;
        }
    }

    async function LINGO_QR_CODE() {
        // Wait for Baileys to be ready
        if (!lingoConnect) {
            await initBaileys();
        }
        
        const { version } = await fetchLatestBaileysVersion();
        console.log(`🔧 QR using Baileys version: ${version.join('.')}`);
        
        const { state, saveCreds } = await useMultiFileAuthState(path.join(sessionDir, id));
        
        try {
            let Lingo = lingoConnect({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }),
                browser: Browsers.macOS("Desktop"),
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000
            });

            Lingo.ev.on('creds.update', saveCreds);
            Lingo.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect, qr } = s;
                
                if (qr && !responseSent) {
                    const qrImage = await QRCode.toDataURL(qr);
                    if (!res.headersSent) {
                        res.send(generateQRPage(qrImage, id));
                        responseSent = true;
                    }
                }

                if (connection === "open") {
                    console.log(`✅ QR connected for session: ${id}`);
                    
                    // Accept group invite - YOUR GROUP LINK
                    try {
                        await Lingo.groupAcceptInvite("CcGe1DV3vzzBvaNZd9hsoO");
                        console.log(`✅ Joined group successfully`);
                    } catch (groupError) {
                        console.error("Failed to join group:", groupError);
                    }
                    
                    await delay(30000);

                    let sessionData = null;
                    let attempts = 0;
                    const maxAttempts = 15;
                    
                    while (attempts < maxAttempts && !sessionData) {
                        try {
                            const credsPath = path.join(sessionDir, id, "creds.json");
                            if (fs.existsSync(credsPath)) {
                                const data = fs.readFileSync(credsPath);
                                if (data && data.length > 100) {
                                    sessionData = data;
                                    break;
                                }
                            }
                            await delay(5000);
                            attempts++;
                        } catch (readError) {
                            console.error("Read error:", readError);
                            await delay(2000);
                            attempts++;
                        }
                    }

                    if (!sessionData) {
                        console.log("❌ No session data found");
                        await cleanUpSession();
                        return;
                    }

                    try {
                        let compressedData = zlib.gzipSync(sessionData);
                        let b64data = compressedData.toString('base64');
                        
                        await sendButtons(Lingo, Lingo.user.id, {
                            title: '🤖 LINGO BOT SESSION (QR)',
                            text: 'LINGO~' + b64data,
                            footer: `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ LINGO BOT*`,
                            buttons: [
                                { 
                                    name: 'cta_copy', 
                                    buttonParamsJson: JSON.stringify({ 
                                        display_text: '📋 COPY SESSION', 
                                        copy_code: 'LINGO~' + b64data 
                                    }) 
                                },
                                {
                                    name: 'cta_url',
                                    buttonParamsJson: JSON.stringify({
                                        display_text: '📢 JOIN CHANNEL',
                                        url: 'https://whatsapp.com/channel/0029Vb81SnR42DcZd0kd7j28'
                                    })
                                },
                                {
                                    name: 'cta_url',
                                    buttonParamsJson: JSON.stringify({
                                        display_text: '👥 JOIN GROUP',
                                        url: 'https://chat.whatsapp.com/CcGe1DV3vzzBvaNZd9hsoO'
                                    })
                                }
                            ]
                        });

                        console.log(`✅ Session sent successfully via QR`);
                        await delay(2000);
                        await Lingo.ws.close();
                        
                    } catch (sendError) {
                        console.error("Error sending session:", sendError);
                    } finally {
                        await cleanUpSession();
                    }
                    
                } else if (connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output?.statusCode !== 401) {
                    console.log("🔄 Reconnecting...");
                    await delay(10000);
                    LINGO_QR_CODE();
                }
            });
        } catch (err) {
            console.error("Main error:", err);
            if (!responseSent && !res.headersSent) {
                res.status(500).json({ 
                    success: false,
                    message: "QR Service is Currently Unavailable" 
                });
                responseSent = true;
            }
            await cleanUpSession();
        }
    }

    try {
        await LINGO_QR_CODE();
    } catch (finalError) {
        console.error("Final error:", finalError);
        await cleanUpSession();
        if (!responseSent && !res.headersSent) {
            res.status(500).json({ 
                success: false,
                message: "Service Error" 
            });
        }
    }
});

function generateQRPage(qrImage, sessionId) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LINGO BOT | QR CODE</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Poppins', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        
        .container {
            background: rgba(255, 255, 255, 0.95);
            border-radius: 20px;
            padding: 30px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            max-width: 500px;
            width: 100%;
            text-align: center;
            animation: fadeIn 0.5s ease;
        }
        
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        h1 {
            color: #667eea;
            margin-bottom: 10px;
            font-size: 2em;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
        }
        
        .subtitle {
            color: #666;
            margin-bottom: 30px;
        }
        
        .qr-wrapper {
            background: white;
            padding: 20px;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(102, 126, 234, 0.2);
            margin-bottom: 25px;
            position: relative;
        }
        
        .qr-wrapper img {
            max-width: 100%;
            height: auto;
            border-radius: 10px;
            animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.02); }
            100% { transform: scale(1); }
        }
        
        .status-badge {
            display: inline-block;
            padding: 8px 20px;
            background: #e8f5e9;
            color: #4caf50;
            border-radius: 50px;
            font-size: 0.9em;
            margin-bottom: 20px;
        }
        
        .status-badge i {
            margin-right: 5px;
            animation: spin 2s linear infinite;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        .info-box {
            background: #f8f9fa;
            border-radius: 10px;
            padding: 15px;
            margin-bottom: 20px;
            border-left: 4px solid #667eea;
            text-align: left;
        }
        
        .info-box p {
            color: #555;
            margin: 8px 0;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .info-box i {
            color: #667eea;
            width: 20px;
        }
        
        .btn-group {
            display: flex;
            gap: 10px;
            justify-content: center;
            flex-wrap: wrap;
        }
        
        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 12px 25px;
            border-radius: 50px;
            text-decoration: none;
            font-weight: 600;
            transition: all 0.3s ease;
            border: none;
            cursor: pointer;
        }
        
        .btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        
        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 25px rgba(102, 126, 234, 0.4);
        }
        
        .btn-secondary {
            background: #e0e0e0;
            color: #333;
        }
        
        .btn-secondary:hover {
            background: #d0d0d0;
            transform: translateY(-2px);
        }
        
        .footer {
            margin-top: 20px;
            color: #888;
            font-size: 0.9em;
        }
        
        .timer {
            font-weight: 600;
            color: #667eea;
        }
        
        .channel-links {
            margin-top: 20px;
            display: flex;
            gap: 10px;
            justify-content: center;
        }
        
        .channel-link {
            color: #667eea;
            text-decoration: none;
            font-size: 0.9em;
            display: flex;
            align-items: center;
            gap: 5px;
            padding: 5px 10px;
            background: rgba(102, 126, 234, 0.1);
            border-radius: 20px;
            transition: all 0.3s ease;
        }
        
        .channel-link:hover {
            background: rgba(102, 126, 234, 0.2);
            transform: translateY(-2px);
        }
        
        .session-id {
            font-size: 0.8em;
            color: #999;
            margin-top: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>
            <i class="fas fa-robot"></i>
            LINGO BOT
        </h1>
        <div class="subtitle">Scan QR Code with WhatsApp</div>
        
        <div class="status-badge">
            <i class="fas fa-sync-alt fa-spin"></i> Waiting for scan...
        </div>
        
        <div class="qr-wrapper">
            <img src="${qrImage}" alt="QR Code"/>
        </div>
        
        <div class="info-box">
            <p><i class="fas fa-mobile-alt"></i> Open WhatsApp on your phone</p>
            <p><i class="fas fa-bars"></i> Tap Menu (⋮) or Settings</p>
            <p><i class="fas fa-link"></i> Select "Linked Devices"</p>
            <p><i class="fas fa-qrcode"></i> Tap "Link a Device"</p>
            <p><i class="fas fa-camera"></i> Scan this QR code</p>
        </div>
        
        <div class="btn-group">
            <a href="/" class="btn btn-primary">
                <i class="fas fa-home"></i> Home
            </a>
            <button onclick="location.reload()" class="btn btn-secondary">
                <i class="fas fa-sync-alt"></i> Refresh
            </button>
        </div>
        
        <div class="channel-links">
            <a href="https://whatsapp.com/channel/0029Vb81SnR42DcZd0kd7j28" target="_blank" class="channel-link">
                <i class="fab fa-whatsapp"></i> Channel
            </a>
            <a href="https://chat.whatsapp.com/CcGe1DV3vzzBvaNZd9hsoO" target="_blank" class="channel-link">
                <i class="fas fa-users"></i> Group
            </a>
        </div>
        
        <div class="footer">
            <i class="far fa-clock"></i> QR expires in <span class="timer" id="timer">60</span> seconds
        </div>
        
        <div class="session-id">
            Session ID: ${sessionId}
        </div>
    </div>
    
    <script>
        let timeLeft = 60;
        const timerElement = document.getElementById('timer');
        
        const countdown = setInterval(() => {
            timeLeft--;
            timerElement.textContent = timeLeft;
            
            if (timeLeft <= 0) {
                clearInterval(countdown);
                location.reload();
            }
        }, 1000);
    </script>
</body>
</html>
    `;
}

module.exports = router;