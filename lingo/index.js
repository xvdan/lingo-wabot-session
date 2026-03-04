const fs = require('fs');
const crypto = require('crypto');

/**
 * Generate a secure random ID for session folders
 * @param {number} length - Length of ID (default: 8)
 * @returns {string} Random alphanumeric ID
 */
function lingoId(length = 8) {
    return crypto.randomBytes(length)
        .toString('base64')
        .replace(/[+/=]/g, '')
        .substring(0, length);
}

/**
 * Generate a random pairing code seed
 * @returns {string} 8-character random code
 */
function generateLingoCode() {
    return crypto.randomBytes(4)
        .toString('hex')
        .toUpperCase()
        .substring(0, 8);
}

/**
 * Securely remove session files
 * @param {string} FilePath - Path to delete
 * @returns {Promise<boolean>} Success status
 */
async function removeFile(FilePath) {
    if (!fs.existsSync(FilePath)) return false;
    
    try {
        await fs.promises.rm(FilePath, { 
            recursive: true, 
            force: true,
            maxRetries: 3,
            retryDelay: 1000
        });
        return true;
    } catch (error) {
        console.error("Error removing file:", error);
        return false;
    }
}

/**
 * Validate phone number format
 * @param {string} number - Phone number to validate
 * @returns {boolean} Is valid
 */
function validatePhoneNumber(number) {
    const cleaned = number.replace(/\D/g, '');
    return cleaned.length >= 10 && cleaned.length <= 15;
}

module.exports = { 
    lingoId, 
    removeFile, 
    generateLingoCode,
    validatePhoneNumber 
};