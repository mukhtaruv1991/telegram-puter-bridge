// File: pages/api/bot.js
// -- نسخة جديدة تعمل بطريقة Long Polling لتجنب مشاكل الشبكة --

const TelegramBot = require('node-telegram-bot-api');
const chrome = require('chrome-aws-lambda');
const puppeteer = require('puppeteer-core');

const TOKEN = process.env.TELEGRAM_TOKEN;
// تهيئة البوت بدون webhook
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

// هذا هو الجزء الذي تغير. الآن نحن نستمع للرسائل مباشرة.
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userText = msg.text;

  if (userText) {
    try {
      await bot.sendChatAction(chatId, 'typing');
      const claudeResponse = await getClaudeResponse(userText);
      await bot.sendMessage(chatId, claudeResponse, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Error processing message:', error);
      try {
        await bot.sendMessage(chatId, 'حدث خطأ فادح أثناء معالجة طلبك.');
      } catch (sendError) {
        console.error('Failed to send error message:', sendError);
      }
    }
  }
});

// نقطة النهاية هذه الآن وظيفتها فقط بدء البوت
export default async function handler(req, res) {
  // نخبر Vercel أن هذه الدالة تعمل بنجاح
  res.status(200).json({
    status: "Bot is running using Long Polling.",
    message: "This endpoint is not meant to be accessed directly.",
  });
}
