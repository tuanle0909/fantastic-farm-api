import { verifyPersonalMessageSignature } from "@mysten/sui/verify";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";

async function test() {
    const bytes = "U2lnbiBpbiB0byBGYW50YXN0aWMgVGVhbQ==";
    const signature = "BQNNMjA0MjkxMzE5MDc5MjkzNjMxNzU5MDg3ODI1NTAzMTg3OTUzMjIyNjc2NTI2Mjc0NDMxOTk3MzcyODE2NzEyOTczNzI4MTI5MTcyMTZMOTIzODA4Mzg2MjgwMTU4MTQ0NTYzNzk4ODEyODQzNzgzMDk3NjI2NzY1ODIyMDIwMDM3ODQyMjM0NjMyNDQ5MzQ3MDEwNTkzNjIzMQExAwJNMTE2NzA4MDIwMzgyMzYwMTEzMDE1NDY1NjM5NzUyNjM4OTA2NzIwODM5MTMxNzQ2MTUwNzY3MTIyOTE1OTc0MDkxMzI4MDcwNzE0NjhNMjEwMzc2MTc4MDk5MTI5NjAzOTg0OTgzOTY1MzEyNTEyNTUwMDY3NjMyNTM1OTEyOTIwNzQzNDUyNjA5ODQ4MzAxNDQ1NjU1NjcyOTcCTDUxNzYwMDA3Mzk3OTA2MDUyMDU2MDkyNDA4MDM3MTM4NzYxMjc3MzU1NzAxNTI1ODg2NjQzOTY1NjE1MDc3OTAyNzIwMzEzODIyOTVNMjE2NjU3NzU5NTg3OTUwNzk4OTIxNzQ2NjU0MTQyODU2NDMxNjM3ODA3Mzk4MDc0Njk1NDU2MTMzNDcyNjQ4OTc5OTc2MzAxNjg5MzgCATEBMANNMTI1Njk0NjY5MjkwNDI1NDIwOTY1MDc1OTE4Njk2MzkyNjgyNDY3MDgwNzc5NzY1NzQzNjQxODUwNzUyNDE5ODg3MDg1NDI0MzU1NzRNMTg1MjY2MzE1Mzk3NDIyNTkzNzc5MDUyMDQ3MDk5NTU2ODI0NjEyNTkzNjQ4NzY0NzgxNTA4MDM1OTgzNzk2NjcxNzI4OTE1ODkwMzABMTF5SnBjM01pT2lKb2RIUndjem92TDJGalkyOTFiblJ6TG1kdmIyZHNaUzVqYjIwaUxDAWZleUpoYkdjaU9pSlNVekkxTmlJc0ltdHBaQ0k2SWpZME56QXhOR1k1WVRSaE5HTmlZbUkyWlRsaFlURm1PV1V6TUdWbE5tTmpOekJrWVRjME1tRWlMQ0owZVhBaU9pSktWMVFpZlFNMTk5MzY2OTA2OTIxODI1MjMxNzE1NjM2ODkwNDY3OTQzMTc5MTU1NTA5OTM4NzEyNTI4MjIxMjAwODg2Nzk3Mzk1MzI3NDE4Nzk4MDQ3BAAAAAAAAGEAt3DVHCUwQPRFgwnidmdrhgbeCThEUqBanDZjvzYj0XeVlwF6qt48pyVl+5ukAvm6Ukmxa4NBw/7LBBLQymGMCN9/C3W/1jEZ+o9wbGIy/USmOKw88TwTCcL+wxw5n/0N";
    
    const messageBytes = new Uint8Array(Buffer.from(bytes, "base64"));
    const client = new SuiClient({ url: getFullnodeUrl("testnet") });
    
    try {
        const publicKey = await verifyPersonalMessageSignature(messageBytes, signature, { client });
        console.log("Verified! Derived address:", publicKey.toSuiAddress());
    } catch (e) {
        console.error("Verification failed:", e);
    }
}

test();
