import express from 'express';
import crypto from 'crypto';

const app = express();
const PORT = 3001;

app.use(express.json({ limit: '50mb' }));

// Firebase config endpoint
app.get('/api/firebase-config', (_req, res) => {
  res.json({
    apiKey: "AIzaSyCcQ5i4liAx3SJjprQjahooAuWozmKizZU",
    authDomain: "vedatool.firebaseapp.com",
    projectId: "vedatool",
    storageBucket: "vedatool.firebasestorage.app",
    messagingSenderId: "226720860057",
    appId: "1:226720860057:web:c8345c1cbb472813f83508",
    measurementId: "G-X570F0Y9JJ",
  });
});

// Parse exam result endpoint (same as vedatool)
app.post('/api/parse-result', async (req, res) => {
  console.log('[VedaRank] Parse request received');

  try {
    const { mode, url, html, responseSheetUrl, submissionId } = req.body;

    let htmlContent = '';
    let finalSubmissionId = submissionId || crypto.randomBytes(16).toString('hex');

    // Handle new format
    if (responseSheetUrl && !mode) {
      const headers = getMobileHeaders();
      const response = await fetch(responseSheetUrl, { headers });
      if (!response.ok) {
        return res.status(400).json({
          success: false,
          message: `Failed to fetch URL: ${response.status} ${response.statusText}`
        });
      }
      htmlContent = await response.text();
    }
    // Handle old format
    else if (mode) {
      if (mode === 'url') {
        if (!url) {
          return res.status(400).json({ success: false, message: 'URL is required' });
        }
        const headers = getMobileHeaders();
        const response = await fetch(url, { headers });
        if (!response.ok) {
          return res.status(400).json({
            success: false,
            message: `Failed to fetch URL: ${response.status} ${response.statusText}`
          });
        }
        htmlContent = await response.text();
      } else if (mode === 'paste' || mode === 'upload') {
        if (!html) {
          return res.status(400).json({ success: false, message: 'HTML content is required' });
        }
        htmlContent = html;
      }
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid request format'
      });
    }

    console.log('[VedaRank] HTML content length:', htmlContent.length);

    const questions = extractQuestionsFromHTML(htmlContent);
    console.log('[VedaRank] Questions extracted:', questions.length);

    const score = questions.filter(q => q.isCorrect).length;

    const metadata = {
      totalQuestions: questions.length,
      correctAnswers: score,
      incorrectAnswers: questions.length - score,
      parsedAt: new Date().toISOString()
    };

    res.json({
      success: true,
      submissionId: finalSubmissionId,
      questions,
      score,
      metadata
    });
  } catch (err: any) {
    console.error('[VedaRank] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to parse result'
    });
  }
});

function getMobileHeaders() {
  return {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 15; V2312 Build/AP3A.240905.015.A2_MOD1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.7827.91 Mobile Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Accept-Language': 'en-US,en;q=0.9',
    'sec-ch-ua': '"Android WebView";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
    'sec-ch-ua-mobile': '?1',
    'sec-ch-ua-platform': '"Android"',
    'Upgrade-Insecure-Requests': '1',
    'dnt': '1',
    'X-Requested-With': 'mark.via.gp',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-User': '?1',
    'Sec-Fetch-Dest': 'document',
  };
}

function extractQuestionsFromHTML(html: string): any[] {
  const questions: any[] = [];

  try {
    // ===== DIGIALM.COM / RRB Format =====
    // Split by question-pnl divs
    const questionPanels = html.split(/class="question-pnl"/i);

    if (questionPanels.length > 1) {
      // Skip first chunk (before first question)
      for (let i = 1; i < questionPanels.length; i++) {
        const panel = questionPanels[i];

        // Extract question number and text
        const qNumMatch = panel.match(/Q\.(\d+)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
        let questionText = '';
        let qNum = i;

        if (qNumMatch) {
          qNum = parseInt(qNumMatch[1]);
          questionText = qNumMatch[2].replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, '').trim();
        } else {
          // Fallback: get text from bold td
          const boldMatch = panel.match(/<td[^>]*class="bold"[^>]*valign="top"[^>]*>([\s\S]*?)<\/td>/i);
          if (boldMatch) {
            questionText = boldMatch[1].replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, '').trim();
          }
        }

        if (!questionText || questionText.length < 3) continue;

        // Extract options (rightAns and wrngAns classes)
        const options: string[] = [];
        let correctAnswer = '';
        let correctIndex = -1;

        const optionPattern = /<td\s+class="(rightAns|wrngAns)"[^>]*>([\s\S]*?)<\/td>/gi;
        const optMatches = [...panel.matchAll(optionPattern)];

        optMatches.forEach((m, idx) => {
          const isCorrect = m[1] === 'rightAns';
          let optText = m[2].replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, '').trim();
          // Remove leading letter like "A. " or "B. "
          optText = optText.replace(/^[A-D]\.\s*/, '');
          options.push(optText);
          if (isCorrect) {
            correctIndex = idx;
            correctAnswer = String.fromCharCode(65 + idx); // A, B, C, D
          }
        });

        // Extract chosen option from menu-tbl
        let chosenOption = '';
        const chosenMatch = panel.match(/Chosen Option\s*:?\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
        if (chosenMatch) {
          chosenOption = chosenMatch[1].replace(/<[^>]*>/g, '').trim();
        }
        // Also try alternate format
        if (!chosenOption) {
          const chosenMatch2 = panel.match(/Chosen\s*Option\s*:?\s*<\/td>\s*<td[^>]*class="bold"[^>]*>(.*?)<\/td>/i);
          if (chosenMatch2) {
            chosenOption = chosenMatch2[1].replace(/<[^>]*>/g, '').trim();
          }
        }

        const isCorrect = chosenOption === correctAnswer;

        questions.push({
          id: `q${qNum}`,
          questionText: questionText.substring(0, 800),
          options,
          answer: correctAnswer,
          isCorrect,
          userAnswer: chosenOption
        });
      }
    }

    // ===== Fallback: Generic patterns =====
    if (questions.length === 0) {
      // Try div with question class
      const questionPattern = /<div[^>]*class="[^"]*question[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
      const matches = [...html.matchAll(questionPattern)];
      let questionIndex = 0;
      for (const match of matches) {
        const questionText = match[1].replace(/<[^>]*>/g, '').trim();
        if (questionText.length > 10) {
          questions.push({
            id: `q${questionIndex++}`,
            questionText: questionText.substring(0, 500),
            options: [],
            answer: '',
            isCorrect: false,
            userAnswer: ''
          });
        }
      }
    }

    // ===== Fallback: Numbered questions =====
    if (questions.length === 0) {
      const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
      const numberedPattern = /Q\.?\s*(\d+)\s*[.):]?\s*([\s\S]*?)(?=Q\.?\s*\d+|$)/gi;
      const numberedMatches = [...text.matchAll(numberedPattern)];

      for (const match of numberedMatches.slice(0, 200)) {
        const qText = match[2]?.trim();
        if (qText && qText.length > 10 && qText.length < 2000) {
          questions.push({
            id: `q${match[1]}`,
            questionText: qText.substring(0, 500),
            options: [],
            answer: '',
            isCorrect: false,
            userAnswer: ''
          });
        }
      }
    }
  } catch (err) {
    console.error('[extractQuestionsFromHTML error]:', err);
  }

  return questions;
}

app.listen(PORT, () => {
  console.log(`[VedaRank Server] Running on http://localhost:${PORT}`);
});
