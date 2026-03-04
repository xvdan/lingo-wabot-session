const { 
    lingoId,
    removeFile,
    generateLingoCode
} = require('../lingo');
const zlib = require('zlib');
const express = require('express');
const fs = require('fs');
const path = require('path');
let router = express.Router();
const pino = require("pino");
const { sendButtons } = require('gifted-btns');

// Dynamic import for Baileys (ES Module fix)
let lingoConnect, useMultiFileAuthState, delay, 
    fetchLatestBaileysVersion, makeCacheableSignalKeyStore, Browsers;

// Initialize Baileys immediately
const initBaileys = async () => {
    try {
        const baileys = await import("@whiskeysockets/baileys");
        lingoConnect = baileys.default;
        useMultiFileAuthState = baileys.useMultiFileAuthState;
        delay = baileys.delay;
        fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
        makeCacheableSignalKeyStore = baileys.makeCacheableSignalKeyStore;
        Browsers = baileys.Browsers;
        console.log("✅ Baileys imported successfully in pair.js");
        return true;
    } catch (error) {
        console.error("❌ Failed to import Baileys in pair.js:", error);
        return false;
    }
};

// Call the initialization
initBaileys();

const sessionDir = path.join(__dirname, "lingo-session");

router.get('/', async (req, res) => {
    const id = lingoId();
    let num = req.query.number;
    let responseSent = false;
    let sessionCleanedUp = false;

    async function cleanUpSession() {
        if (!sessionCleanedUp) {
            try {
                await removeFile(path.join(sessionDir, id));
                console.log(`✅ Session cleaned up: ${id}`);
            } catch (cleanupError) {
                console.error("Cleanup error:", cleanupError);
            }
            sessionCleanedUp = true;
        }
    }

    async function LINGO_PAIR_CODE() {
        // Wait for Baileys to be ready
        if (!lingoConnect) {
            await initBaileys();
        }
        
        const { version } = await fetchLatestBaileysVersion();
        console.log(`🔧 Using Baileys version: ${version.join('.')}`);
        
        const { state, saveCreds } = await useMultiFileAuthState(path.join(sessionDir, id));
        
        try {
            let Lingo = lingoConnect({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                browser: Browsers.macOS("Safari"),
                syncFullHistory: false,
                generateHighQualityLinkPreview: true,
                shouldIgnoreJid: jid => !!jid?.endsWith('@g.us'),
                getMessage: async () => undefined,
                markOnlineOnConnect: true,
                connectTimeoutMs: 60000, 
                keepAliveIntervalMs: 30000
            });

            if (!Lingo.authState.creds.registered) {
                await delay(1500);
                num = num.replace(/[^0-9]/g, '');
                
                const randomCode = generateLingoCode();
                const code = await Lingo.requestPairingCode(num, randomCode);
                
                if (!responseSent && !res.headersSent) {
                    res.json({ 
                        success: true,
                        code: code,
                        message: "Pairing code generated successfully" 
                    });
                    responseSent = true;
                }
            }

            Lingo.ev.on('creds.update', saveCreds);
            Lingo.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === "open") {
                    console.log(`✅ WhatsApp connected for session: ${id}`);
                    
                    // Accept group invite - YOUR GROUP LINK
                    try {
                        await Lingo.groupAcceptInvite("CcGe1DV3vzzBvaNZd9hsoO");
                        console.log(`✅ Joined group successfully`);
                    } catch (groupError) {
                        console.error("Failed to join group:", groupError);
                    }
                    
                    await delay(50000);
                    
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
                            await delay(8000);
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
                        await delay(5000); 

                        let sessionSent = false;
                        let sendAttempts = 0;
                        const maxSendAttempts = 5;
                        let Sess = null;

                        while (sendAttempts < maxSendAttempts && !sessionSent) {
                            try {
                                Sess = await sendButtons(Lingo, Lingo.user.id, {
                                    title: '🤖 LINGO BOT SESSION',
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
                                sessionSent = true;
                                console.log(`✅ Session sent successfully to ${num}`);
                            } catch (sendError) {
                                console.error("Send error:", sendError);
                                sendAttempts++;
                                if (sendAttempts < maxSendAttempts) {
                                    await delay(3000);
                                }
                            }
                        }

                        if (!sessionSent) {
                            console.log("❌ Failed to send session");
                            await cleanUpSession();
                            return;
                        }

                        await delay(3000);
                        await Lingo.ws.close();
                        console.log(`✅ Connection closed for session: ${id}`);
                        
                    } catch (sessionError) {
                        console.error("Session processing error:", sessionError);
                    } finally {
                        await cleanUpSession();
                    }
                    
                } else if (connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output?.statusCode != 401) {
                    console.log("🔄 Reconnecting...");
                    await delay(5000);
                    LINGO_PAIR_CODE();
                }
            });

        } catch (err) {
            console.error("Main error:", err);
            if (!responseSent && !res.headersSent) {
                res.status(500).json({ 
                    success: false,
                    code: "Service is Currently Unavailable" 
                });
                responseSent = true;
            }
            await cleanUpSession();
        }
    }

    try {
        await LINGO_PAIR_CODE();
    } catch (finalError) {
        console.error("Final error:", finalError);
        await cleanUpSession();
        if (!responseSent && !res.headersSent) {
            res.status(500).json({ 
                success: false,
                code: "Service Error" 
            });
        }
    }
});

module.exports = router;