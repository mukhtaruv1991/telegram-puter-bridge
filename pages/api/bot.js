// File: pages/api/bot.js
// -- نسخة متقدمة: نظام ذاتي الإصلاح لتحديث مفتاح API --

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// --- استيراد المتغيرات من Vercel ---
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
let GEMINI_API_KEY = process.env.GEMINI_API_KEY; // نستخدم let للسماح بتحديثه
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID; // معرف المستخدم المسؤول

const bot = new TelegramBot(TELEGRAM_TOKEN);

// --- دالة تحديث متغير البيئة في Vercel ---
async function updateVercelEnv(newApiKey) {
    // أولاً، نحتاج إلى معرف متغير البيئة الخاص بـ GEMINI_API_KEY
    const getEnvUrl = `https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/env`;
    const headers = { 'Authorization': `Bearer ${VERCEL_TOKEN}` };

    try {
        const response = await axios.get(getEnvUrl, { headers });
        const envVar = response.data.envs.find(env => env.key === 'GEMINI_API_KEY');
        
        if (!envVar) {
            throw new Error('GEMINI_API_KEY environment variable not found in Vercel project.');
        }

        const envVarId = envVar.id;
        const updateEnvUrl = `https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/env/${envVarId}`;
        
        // الآن، نحدث المتغير بالقيمة الجديدة
        await axios.patch(updateEnvUrl, { value: newApiKey }, { headers });

        // تحديث المفتاح في الذاكرة للجلسة الحالية
        GEMINI_API_KEY = newApiKey;
        
        return true;
    } catch (error) {
        console.error("Failed to update Vercel environment variable:", error.response ? error.response.data : error.message);
        return false;
    }
}

// --- دالة الاتصال بـ Gemini ---
async function getGeminiResponse(prompt) {
    const model = 'gemini-1.5-pro-latest';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

    try {
        const response = await axios.post(url, { contents: [{ role: "user", parts: [{ text: prompt }] }] }, { headers: { 'Content-Type': 'application/json' }, timeout: 120000 });
        return { success: true, data: response.data.candidates[0].content.parts[0].text };
    } catch (error) {
        // الكشف عن خطأ الحصة
        if (error.response && (error.response.status === 429 || (error.response.data && error.response.data.error && error.response.data.error.message.includes("quota")))) {
            return { success: false, error: 'quota_exceeded' };
        }
        console.error("Error calling Gemini API:", error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        return { success: false, error: error.message };
    }
}

// --- المعالج الرئيسي ---
export default async function handler(req, res) {
    try {
        const { message } = req.body;

        if (message && message.text) {
            const chatId = message.chat.id;
            const userText = message.text;

            // --- منطق تحديث المفتاح ---
            if (userText.startsWith('apikey ') && String(chatId) === ADMIN_CHAT_ID) {
                const newKey = userText.split(' ')[1];
                await bot.sendMessage(chatId, '⏳ جارٍ تحديث مفتاح API في Vercel...');
                const updated = await updateVercelEnv(newKey);
                if (updated) {
                    await bot.sendMessage(chatId, '✅ تم تحديث مفتاح API بنجاح! سيتم استخدام المفتاح الجديد في الطلبات القادمة.');
                } else {
                    await bot.sendMessage(chatId, '❌ فشلت عملية تحديث المفتاح. يرجى مراجعة سجلات Vercel.');
                }
                return res.status(200).send('OK');
            }

            // --- المنطق العادي للدردشة ---
            await bot.sendChatAction(chatId, 'typing');
            const result = await getGeminiResponse(userText);

            if (result.success) {
                await bot.sendMessage(chatId, result.data);
            } else if (result.error === 'quota_exceeded') {
                // إرسال طلب للمفتاح الجديد فقط للمستخدم المسؤول
                if (String(chatId) === ADMIN_CHAT_ID) {
                    await bot.sendMessage(chatId, '🚫 لقد استهلكت حصتك المجانية. لتحديث المفتاح، أرسل رسالة بالتنسيق التالي:\n\n`apikey YOUR_NEW_API_KEY`');
                } else {
                    await bot.sendMessage(chatId, 'عذرًا، الخدمة تواجه ضغطًا حاليًا. يرجى المحاولة مرة أخرى لاحقًا.');
                }
            } else {
                await bot.sendMessage(chatId, `عذرًا، حدث خطأ: ${result.error}`);
            }
        }
    } catch (error) {
        console.error('Handler Error:', error);
    } finally {
        res.status(200).send('OK');
    }
}
