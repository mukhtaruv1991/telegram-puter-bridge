// File: pages/api/bot.js
// -- نسخة نهائية: تعمل مع Google Gemini API مباشرة --

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
// استيراد مفتاح Gemini API من متغيرات البيئة
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const bot = new TelegramBot(TELEGRAM_TOKEN);

// دالة جديدة تتصل بـ Google Gemini API
async function getGeminiResponse(prompt) {
    // اسم النموذج
    const model = 'gemini-1.5-flash'; // استخدام نموذج فلاش السريع
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

    try {
        const response = await axios.post(
            url,
            {
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }]
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                },
                timeout: 120000, // مهلة 120 ثانية
            }
        );

        // استخراج الرد من بنية بيانات Gemini
        if (response.data && response.data.candidates && response.data.candidates[0].content.parts[0].text) {
            return response.data.candidates[0].content.parts[0].text;
        } else {
            throw new Error('Invalid response structure from Gemini API');
        }

    } catch (error) {
        console.error("Error calling Gemini API:", error.response ? error.response.data : error.message);
        return `عذرًا، حدث خطأ أثناء التواصل مع Google Gemini API. (الخطأ: ${error.message})`;
    }
}

// المعالج الرئيسي للرسائل
export default async function handler(req, res) {
    try {
        const { message } = req.body;

        if (message && message.text) {
            const chatId = message.chat.id;
            const userText = message.text;
            
            await bot.sendChatAction(chatId, 'typing');
            const geminiResponse = await getGeminiResponse(userText);
            await bot.sendMessage(chatId, geminiResponse);
        }
    } catch (error) {
        console.error('Handler Error:', error);
    } finally {
        res.status(200).send('OK');
    }
}
