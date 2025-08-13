// File: pages/api/bot.js
// هذا هو الخادم الوسيط الذي يربط تليجرام بـ Puter.js

// في بيئة Vercel، نستخدم chrome-aws-lambda
// في البيئة المحلية (للتجربة)، نستخدم puppeteer العادي
const chrome = require('chrome-aws-lambda');
const puppeteer = require('puppeteer-core');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

// دالة لتشغيل المتصفح الوهمي والحصول على رد من Claude
async function getClaudeResponse(prompt) {
  let browser = null;
  try {
    // إعدادات المتصفح للعمل على Vercel
    browser = await puppeteer.launch({
      args: chrome.args,
      executablePath: await chrome.executablePath,
      headless: chrome.headless,
    });

    const page = await browser.newPage();
    
    // صفحة HTML بسيطة تحتوي على كود Puter.js
    // يتم حقن الرسالة (prompt) داخلها بشكل آمن
    const htmlContent = `
      <html>
        <body>
          <script src="https://js.puter.com/v2/"></script>
          <script>
            async function getResponse() {
              try {
                const prompt = document.body.dataset.prompt;
                const response = await window.puter.ai.chat(prompt, { model: 'claude-3-sonnet-20240229' });
                document.body.innerText = response.message.content[0].text;
              } catch (e) {
                document.body.innerText = 'PuterJS_Error: ' + e.message;
              }
            }
          </script>
        </body>
      </html>
    `;
    
    await page.setContent(htmlContent);
    
    // تمرير الرسالة إلى الصفحة بأمان وتشفيرها
    await page.evaluate((prompt) => {
      document.body.dataset.prompt = prompt;
    }, prompt);

    // تنفيذ الدالة داخل المتصفح
    await page.evaluate(() => getResponse());
    
    // انتظار الرد لمدة تصل إلى 90 ثانية
    await page.waitForFunction(() => document.body.innerText.trim() !== '', { timeout: 90000 });

    const responseText = await page.evaluate(() => document.body.innerText);
    
    if(responseText.startsWith('PuterJS_Error:')) {
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

      // لا ننتظر الرد هنا، بل نرسل استجابة فورية لتليجرام
      res.status(200).send('OK');

      // ثم نبدأ العملية الطويلة في الخلفية
      try {
        // إرسال رسالة "جاري الكتابة..." للمستخدم
        await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendChatAction`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
        });

        // الحصول على الرد من Claude عبر الجسر
        const claudeResponse = await getClaudeResponse(userText);

        // إرسال الرد النهائي للمستخدم
        await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: claudeResponse }),
        });

      } catch (e) {
        console.error("Failed to process message:", e);
      }

    } else {
      res.status(200).send('OK'); // تجاهل الرسائل التي ليست نصية
    }
  } else {
    res.status(200).send('Bot is running. Set your webhook to this URL.');
  }
}
