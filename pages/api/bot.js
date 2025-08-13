// File: pages/api/bot.js
// -- نسخة نهائية: استخدام مكتبة puppeteer الكاملة --

const TelegramBot = require('node-telegram-bot-api');
const puppeteer = require('puppeteer'); // استخدام مكتبة puppeteer الكاملة

const TOKEN = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(TOKEN);

const userModelSelection = {};

async function getAiResponse(prompt, modelName) {
    let browser = null;
    try {
        // لا نحتاج لـ executablePath أو args من chrome-aws-lambda
        browser = await puppeteer.launch({
            headless: true, // تشغيل المتصفح بدون واجهة رسومية
            args: ['--no-sandbox', '--disable-setuid-sandbox'], // ضروري لبيئات الخادم
        });

        const page = await browser.newPage();
        
        const htmlContent = `
          <html><body>
            <script src="https://js.puter.com/v2/"></script>
            <script>
              async function getResponse(p, model) {
                try {
                  const response = await window.puter.ai.chat(p, { model: model });
                  document.body.innerText = response.message.content[0].text;
                } catch (e) {
                  document.body.innerText = 'PuterJS_Error: ' + e.message;
                }
              }
            </script>
          </body></html>
        `;
        
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        await page.evaluate((prompt, modelName) => { getResponse(prompt, modelName); }, prompt, modelName);
        await page.waitForFunction(() => document.body.innerText.trim() !== '', { timeout: 150000 });

        const responseText = await page.evaluate(() => document.body.innerText);
        
        if (responseText.startsWith('PuterJS_Error:')) {
            throw new Error(`Puter.js (${modelName}) failed: ${responseText.replace('PuterJS_Error: ', '')}`);
        }
        return responseText;

    } catch (error) {
        console.error(`Error in getAiResponse for model ${modelName}:`, error);
        if (error.message.includes('Timeout')) {
            return `عذرًا، استغرق ${modelName} وقتًا طويلاً جدًا للرد.`;
        }
        return `عذرًا، حدث خطأ: ${error.message}`;
    } finally {
        if (browser) {
            await browser.close();
        }
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
                await bot.sendMessage(chatId, aiResponse, { parse_mode: 'Markdown' });
            }
        }
    } catch (error) {
        console.error('Handler Error:', error);
    } finally {
        res.status(200).send('OK');
    }
}
