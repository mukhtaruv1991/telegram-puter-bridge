// File: pages/api/bot.js
// -- نسخة جديدة: Webhook مع Axios وإعادة محاولة للاتصال بتليجرام --

const TelegramBot = require('node-telegram-bot-api');
const chrome = require('chrome-aws-lambda');
const puppeteer = require('puppeteer-core');
const axios = require('axios'); // استيراد Axios

const TOKEN = process.env.TELEGRAM_TOKEN;
// لا نقوم بتهيئة البوت هنا للاستماع، بل نستخدم التوكن لإرسال الردود
// const bot = new TelegramBot(TOKEN); // هذا السطر لم يعد يستخدم للاستماع

// دالة لإرسال رسالة إلى تليجرام مع إعادة محاولة
async function sendTelegramMessage(chatId, text, parseMode = 'Markdown') {
  const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: parseMode,
  };

  for (let i = 0; i < 3; i++) { // حاول 3 مرات
    try {
      await axios.post(url, payload, { timeout: 10000 }); // مهلة 10 ثوانٍ
      return; // نجح الإرسال، اخرج من الدالة
    } catch (error) {
      console.error(`Attempt ${i + 1} failed to send message to Telegram:`, error.message);
      if (i < 2) await new Promise(resolve => setTimeout(resolve, 1000)); // انتظر ثانية قبل إعادة المحاولة
    }
  }
  console.error(`Failed to send message to Telegram after multiple retries for chat ID: ${chatId}`);
}

// دالة لإرسال "جاري الكتابة..."
async function sendTelegramChatAction(chatId, action = 'typing') {
  const url = `https://api.telegram.org/bot${TOKEN}/sendChatAction`;
  const payload = {
    chat_id: chatId,
    action: action,
  };
  try {
    await axios.post(url, payload, { timeout: 5000 });
  } catch (error) {
    console.error(`Failed to send chat action to Telegram:`, error.message);
  }
}

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

// نقطة النهاية الرئيسية التي يستدعيها تليجرام (Webhook)
export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { message } = req.body;

    if (message && message.text) {
      const chatId = message.chat.id;
      const userText = message.text;

      // نرسل استجابة OK فورًا لتليجرام لتجنب انتهاء المهلة
      res.status(200).send('OK');

      // ثم نبدأ العملية الطويلة في الخلفية
      try {
        await sendTelegramChatAction(chatId, 'typing');
        const claudeResponse = await getClaudeResponse(userText);
        await sendTelegramMessage(chatId, claudeResponse);
      } catch (error) {
        console.error('Error processing message:', error);
        // محاولة إرسال رسالة خطأ للمستخدم إذا فشل كل شيء
        await sendTelegramMessage(chatId, 'عذرًا، حدث خطأ فادح أثناء معالجة طلبك.');
      }
    } else {
      res.status(200).send('OK'); // تجاهل الرسائل التي ليست نصية
    }
  } else {
    res.status(200).send('Bot is running. Set your webhook to this URL.');
  }
}
