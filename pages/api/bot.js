// File: pages/api/bot.js
// -- نسخة نهائية: تصحيح بنية الطلب لـ Google Gemini API --

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const bot = new TelegramBot(TELEGRAM_TOKEN);

// دالة جديدة تتصل بـ Google Gemini API
async function getGeminiResponse(prompt) {
    // اسم النموذج
    const model = 'gemini-1.5-pro-latest'; // استخدام النموذج الاحترافي الأقوى
  //  const model = 'gemini-1.5-flash-latest'; // استخدام أحدث نسخة من فلاش
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

    try {
        const response = await axios.post(
            url,
            {
                // -- هذا هو الجزء الذي تم تصحيحه --
                // يجب أن يكون "contents" مصفوفة من الكائنات
                // وكل كائن يحتوي على "parts" كمصفوفة
                "contents": [
                    {
                        "role": "user", // تحديد دور المرسل
                        "parts": [
                            {
                                "text": prompt
                            }
                        ]
                    }
                ]
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
            // في حالة وجود رد فارغ أو حظر للسلامة
            if (response.data.candidates && response.data.candidates[0].finishReason === 'SAFETY') {
                return "عذرًا، لم أتمكن من إنشاء رد لأن المحتوى قد يخالف سياسات السلامة.";
            }
            throw new Error('Invalid or empty response structure from Gemini API');
        }

    } catch (error) {
        // طباعة الخطأ الكامل لمزيد من التفاصيل
        console.error("Error calling Gemini API:", error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        const errorMessage = error.response && error.response.data && error.response.data.error ? error.response.data.error.message : error.message;
        return `عذرًا، حدث خطأ أثناء التواصل مع Google Gemini API. (الخطأ: ${errorMessage})`;
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
