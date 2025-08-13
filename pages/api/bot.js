// File: pages/api/bot.js
// -- نسخة نهائية: زيادة المهلة وإضافة رسالة خطأ أفضل --

const TelegramBot = require('node-telegram-bot-api');
const chrome = require('chrome-aws-lambda');
const puppeteer = require('puppeteer-core');

const TOKEN = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(TOKEN);

async function getClaudeResponse(prompt) {
  let browser = null;
  try {
    browser = await puppeteer.launch({
      args: chrome.args,
      executablePath: await chrome.executablePath,
      headless: chrome.headless,
    });

    const page = await browser.newPage();
    
    const htmlContent = `
      <html><body>
        <script src="https://js.puter.com/v2/"></script>
        <script>
          async function getResponse(p) {
            try {
              const response = await window.puter.ai.chat(p, { model: 'claude-3-sonnet-20240229' });
              document.body.innerText = response.message.content[0].text;
            } catch (e) {
              document.body.innerText = 'PuterJS_Error: ' + e.message;
            }
          }
        </script>
      </body></html>
    `;
    
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    
    await page.evaluate((prompt) => { getResponse(prompt); }, prompt);
    
    // زيادة المهلة إلى 150 ثانية (دقيقتين ونصف)
    await page.waitForFunction(() => document.body.innerText.trim() !== '', { timeout: 150000 });

    const responseText = await page.evaluate(() => document.body.innerText);
    
    if (responseText.startsWith('PuterJS_Error:')) {
      // إرسال رسالة خطأ أكثر تحديدًا
      throw new Error(`Puter.js failed with message: ${responseText.replace('PuterJS_Error: ', '')}`);
    }
    
    return responseText;

  } catch (error) {
    console.error("Error in getClaudeResponse:", error);
    // تعديل رسالة الخطأ لتكون أكثر وضوحًا للمستخدم
    if (error.message.includes('Timeout')) {
      return "عذرًا، استغرق Claude وقتًا طويلاً جدًا للرد (أكثر من دقيقتين ونصف). الرجاء المحاولة مرة أخرى برسالة أبسط.";
    }
    return `عذرًا، حدث خطأ أثناء التواصل مع Puter.js. قد تكون الخدمة متوقفة مؤقتًا. (الخطأ: ${error.message})`;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

export default async function handler(req, res) {
  try {
    const { message } = req.body;
    if (message && message.text) {
      const chatId = message.chat.id;
      const userText = message.text;

      await bot.sendChatAction(chatId, 'typing');
      const claudeResponse = await getClaudeResponse(userText);
      await bot.sendMessage(chatId, claudeResponse, { parse_mode: 'Markdown' });
    }
  } catch (error) {
    console.error('Handler Error:', error);
  } finally {
    res.status(200).send('OK');
  }
}
