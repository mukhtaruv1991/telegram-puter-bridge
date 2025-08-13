// File: pages/api/bot.js
// -- نسخة نهائية جذرية: استدعاء API مباشر بدون متصفح --

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TOKEN = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(TOKEN);

const userModelSelection = {};

// دالة جديدة تستدعي API Puter مباشرة
async function getAiResponse(prompt, modelName) {
    try {
        const response = await axios.post(
            'https://api.puter.com/ai/chat',
            {
                model: modelName,
                messages: [{ role: 'user', content: prompt }],
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    // Puter.js يعتمد على هذا الرأس لتحديد المصدر
                    'Referer': 'https://puter.com/chat', 
                },
                timeout: 150000, // مهلة 150 ثانية
            }
        );

        // استخراج الرد من البيانات
        if (response.data && response.data.message && response.data.message.content) {
            return response.data.message.content[0].text;
        } else {
            throw new Error('Invalid response structure from Puter API');
        }

    } catch (error) {
        console.error(`Error in getAiResponse for model ${modelName}:`, error.response ? error.response.data : error.message);
        return `عذرًا، حدث خطأ أثناء التواصل المباشر مع Puter API. (الخطأ: ${error.message})`;
    }
}

export default async function handler(req, res) {
    try {
        const body = req.body;

        if (body.callback_query) {
            const chatId = body.callback_query.message.chat.id;
            const modelChoice = body.callback_query.data;
            userModelSelection[chatId] = modelChoice;
            const modelDisplayName = modelChoice === 'gemini' ? 'Gemini 1.5 Pro' : 'Claude 3 Sonnet';
            await bot.sendMessage(chatId, `✅ تم اختيار نموذج ${modelDisplayName}.`);
            await bot.answerCallbackQuery(body.callback_query.id);
        }
        else if (body.message) {
            const chatId = body.message.chat.id;
            const userText = body.message.text;

            if (userText === '/model') {
                const options = {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '🤖 Gemini 1.5 Pro', callback_data: 'gemini' },
                                { text: '✨ Claude 3 Sonnet', callback_data: 'claude' }
                            ]
                        ]
                    }
                };
                await bot.sendMessage(chatId, 'اختر النموذج الذي تريد استخدامه:', options);
            }
            else if (userText) {
                const selectedModel = userModelSelection[chatId] || 'claude'; 
                const modelApiName = selectedModel === 'gemini' ? 'gemini-1.5-pro-latest' : 'claude-3-sonnet-20240229';
                
                await bot.sendChatAction(chatId, 'typing');
                const aiResponse = await getAiResponse(userText, modelApiName);
                await bot.sendMessage(chatId, aiResponse);
            }
        }
    } catch (error) {
        console.error('Handler Error:', error);
    } finally {
        res.status(200).send('OK');
    }
}
