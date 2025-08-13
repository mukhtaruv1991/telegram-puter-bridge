// File: pages/api/bot.js
// -- نسخة جديدة: Webhook مع Axios وإعادة محاولة للاتصال بتليجرام --

const TelegramBot = require('node-telegram-bot-api');
const chrome = require('chrome-aws-lambda');
const puppeteer = require('puppeteer-core');
const axios = require('axios'); // استيراد Axios

const TOKEN = process.env.TELEGRAM_TOKEN;

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
    console.log("1. Starting getClaudeResponse for prompt:", prompt); // سجل 1
    browser = await puppeteer.launch({
      args: chrome.args,
      executablePath: await chrome.executablePath,
      headless: chrome.headless,
    });
    console.log("2. Browser launched."); // سجل 2

    const page = await browser.newPage();
    console.log("3. New page created."); // سجل 3
    
    const htmlContent = `
      <html><body>
        <script src="https://js.puter.com/v2/"></script>
        <script>
          async function getResponse(p) {
            try {
              console.log("PuterJS: Calling puter.ai.chat with prompt:", p); // سجل داخل المتصفح الوهمي
              const response = await window.puter.ai.chat(p, { model: 'claude-3-sonnet-20240229' });
              console.log("PuterJS: Received response:", response); // سجل داخل المتصفح الوهمي
              document.body.innerText = response.message.content[0].text;
            } catch (e) {
              document.body.innerText = 'PuterJS_Error: ' + e.message;
              console.error("PuterJS: Error in getResponse:", e); // سجل داخل المتصفح الوهمي
            }
          }
        </script>
      </body></html>
    `;
    
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    console.log("4. HTML content set."); // سجل 4
    
    await page.evaluate((prompt) => {
      // @ts-ignore
      getResponse(prompt);
    }, prompt);
    console.log("5. getResponse function evaluated in page."); // سجل 5
    
    await page.waitForFunction(() => document.body.innerText.trim() !== '', { timeout: 90000 });
    console.log("6. Page content updated (response received)."); // سجل 6

    const responseText = await page.evaluate(() => document.body.innerText);
    console.log("7. Response text extracted:", responseText.substring(0, 100) + "..."); // سجل 7
    
    if (responseText.startsWith('PuterJS_Error:')) {
      throw new Error(responseText);
    }

    return responseText;

  } catch (error) {
    console.error("8. Error in getClaudeResponse:", error); // سجل 8
    return "عذرًا، حدث خطأ أثناء محاولة الحصول على رد. قد يكون هناك ضغط على الخدمة.";
  } finally {
    if (browser) {
      await browser.close();
      console.log("9. Browser closed."); // سجل 9
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
        console.log("Handler: Received message from chat ID:", chatId, "Text:", userText); // سجل A
        await sendTelegramChatAction(chatId, 'typing');
        console.log("Handler: Sent typing action."); // سجل B
        const claudeResponse = await getClaudeResponse(userText);
        console.log("Handler: Received Claude response."); // سجل C
        await sendTelegramMessage(chatId, claudeResponse);
        console.log("Handler: Sent Claude response to Telegram."); // سجل D
      } catch (error) {
        console.error('Handler: Error processing message:', error); // سجل E
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
