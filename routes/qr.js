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
const {
    default: lingoConnect,
    useMultiFileAuthState,
    Browsers,
    delay,
    downloadContentFromMessage, 
    generateWAMessageFromContent, 
    normalizeMessageContent,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require("@whiskeysockets/baileys");

const sessionDir = path.join(__dirname, "lingo-session");

router.get('/', async (req, res) => {
    const id = lingoId(8);
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
                        res.send(`
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
        }
        
        h1 {
            color: #667eea;
            margin-bottom: 10px;
            font-size: 2em;
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
        }
        
        .qr-wrapper img {
            max-width: 100%;
            height: auto;
            border-radius: 10px;
        }
        
        .info-box {
            background: #f8f9fa;
            border-radius: 10px;
            padding: 15px;
            margin-bottom: 20px;
            border-left: 4px solid #667eea;
        }
        
        .info-box p {
            color: #555;
            margin: 5px 0;
        }
        
        .btn {
            display: inline-flex;
            align-items: center;
            gap: 10px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 12px 30px;
            border-radius: 50px;
            text-decoration: none;
            font-weight: 600;
            transition: all 0.3s ease;
            border: none;
            cursor: pointer;
        }
        
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 25px rgba(102, 126, 234, 0.4);
        }
        
        .footer {
            margin-top: 20px;
            color: #888;
            font-size: 0.9em;
        }
        
        .status {
            display: inline-block;
            padding: 5px 15px;
            background: #e8f5e9;
            color: #4caf50;
            border-radius: 50px;
            font-size: 0.9em;
            margin-bottom: 15px;
        }
        
        .status i {
            margin-right: 5px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1><i class="fas fa-robot"></i> LINGO BOT</h1>
        <div class="subtitle">WhatsApp QR Login</div>
        
        <div class="status">
            <i class="fas fa-sync-alt fa-spin"></i> Waiting for scan...
        </div>
        
        <div class="qr-wrapper">
            <img src="${qrImage}" alt="QR Code"/>
        </div>
        
        <div class="info-box">
            <p><i class="fas fa-mobile-alt"></i> Open WhatsApp on your phone</p>
            <p><i class="fas fa-qrcode"></i> Tap Menu > Linked Devices</p>
            <p><i class="fas fa-camera"></i> Scan this QR code</p>
        </div>
        
        <a href="/" class="btn">
            <i class="fas fa-home"></i> Back to Home
        </a>
        
        <div class="footer">
            <i class="far fa-clock"></i> QR expires in 60 seconds
        </div>
    </div>
    
    <script>
        // Auto-refresh after 60 seconds
        setTimeout(() => {
            location.reload();
        }, 60000);
    </script>
</body>
</html>
                        `);
                        responseSent = true;
                    }
                }

                if (connection === "open") {
                    console.log(`✅ QR connected for session: ${id}`);
                    
                    await delay(15000);

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
                            await delay(3000);
                            attempts++;
                        } catch (readError) {
                            console.error("Read error:", readError);
                            await delay(2000);
                            attempts++;
                        }
                    }

                    if (!sessionData) {
                        await cleanUpSession();
                        return;
                    }

                    try {
                        let compressedData = zlib.gzipSync(sessionData);
                        let b64data = compressedData.toString('base64');
                        
                        const sessionMessage = `*LINGO BOT SESSION (QR)*\n\n` +
                            `━━━━━━━━━━━━━━━━\n` +
                            `🎯 *Session ID:* ${id}\n` +
                            `📱 *Login:* QR Code\n` +
                            `⏰ *Time:* ${new Date().toLocaleString()}\n` +
                            `━━━━━━━━━━━━━━━━\n\n` +
                            `⬇️ *Copy your session below:*\n\n` +
                            `LINGO~${b64data}\n\n` +
                            `━━━━━━━━━━━━━━━━\n` +
                            `> *POWERED BY LINGO BOT*`;

                        await Lingo.sendMessage(Lingo.user.id, {
                            text: sessionMessage
                        });

                        await delay(2000);
                        await Lingo.ws.close();
                        
                    } catch (sendError) {
                        console.error("Error sending session:", sendError);
                    } finally {
                        await cleanUpSession();
                    }
                    
                } else if (connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output?.statusCode !== 401) {
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

module.exports = router;