// File: pages/api/bot.js
// -- نسخة نهائية تستخدم @sparticvs/chromium الأكثر استقرارًا --

const TelegramBot = require('node-telegram-bot-api');
const chromium = require('@sparticvs/chromium');
const puppeteer = require('puppeteer-core');

const TOKEN = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(TOKEN);

async function getClaudeResponse(prompt) {
  let browser = null;
  try {
    console.log("1. Launching browser with @sparticvs/chromium...");
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });
    console.log("2. Browser launched successfully.");

    const page = await browser.newPage();
    console.log("3. New page created.");
    
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
    console.log("4. HTML content set.");
    
    await page.evaluate((prompt) => { getResponse(prompt); }, prompt);
    console.log("5. getResponse function evaluated.");
    
    await page.waitForFunction(() => document.body.innerText.trim() !== '', { timeout: 90000 });
    console.log("6. Page content updated, response received from PuterJS.");

    const responseText = await page.evaluate(() => document.body.innerText);
    
    if (responseText.startsWith('PuterJS_Error:')) {
      throw new Error(responseText);
    }
    console.log("7. Response extracted successfully.");
    return responseText;

  } catch (error) {
    console.error("8. Error in getClaudeResponse:", error);
    return "عذرًا، حدث خطأ أثناء محاولة الحصول على رد. قد يكون هناك ضغط على الخدمة.";
  } finally {
    if (browser) {
      await browser.close();
      console.log("9. Browser closed.");
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
