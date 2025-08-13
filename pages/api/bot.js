// File: pages/api/bot.js
// -- نسخة محدثة وأكثر استقرارًا --

const TelegramBot = require('node-telegram-bot-api');
const chrome = require('chrome-aws-lambda');
const puppeteer = require('puppeteer-core');

const TOKEN = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(TOKEN);

// دالة لتشغيل المتصفح الوهمي والحصول على رد من Claude
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
    
    // تنفيذ الدالة داخل المتصفح مع تمرير الرسالة
    await page.evaluate((prompt) => {
      // @ts-ignore
      getResponse(prompt);
    }, prompt);
    
    await page.waitForFunction(() => document.body.innerText.trim() !== '', { timeout: 90000 });

    const responseText = await page.evaluate(() => document.body.innerText);
    
    if (responseText.startsWith('PuterJS_Error:')) {
      throw new Error(responseText);
    }

    return responseText;

  } catch (error) {
    console.error("Puppeteer/Puter.js error:", error);
    return "عذرًا، حدث خطأ أثناء محاولة الحصول على رد. قد يكون هناك ضغط على الخدمة.";
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// نقطة النهاية الرئيسية التي يستدعيها تليجرام
export default async function handler(req, res) {
  try {
    const { message } = req.body;

    if (message && message.text) {
      const chatId = message.chat.id;
      const userText = message.text;

      // إرسال رسالة "جاري الكتابة..." للمستخدم
      await bot.sendChatAction(chatId, 'typing');

      // الحصول على الرد من Claude
      const claudeResponse = await getClaudeResponse(userText);

      // إرسال الرد النهائي للمستخدم
      await bot.sendMessage(chatId, claudeResponse, { parse_mode: 'Markdown' });
    }
  } catch (error) {
    console.error('Error in handler:', error);
  } finally {
    // إرسال استجابة OK لتليجرام لتأكيد استلام الرسالة
    res.status(200).send('OK');
  }
}
