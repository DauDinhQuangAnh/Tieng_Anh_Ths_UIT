(function () {
  // Combine datasets loaded from /data/*.js
  const getTests = () => [
    ...(window.TESTS_1_TO_3 || []),
    ...(window.TESTS_4_TO_6 || []),
    ...(window.TESTS_7_TO_10 || [])
  ];
  const getGrammarSets = () => window.GRAMMAR_PRACTICE || [];
  const getWritingSets = () => window.WRITING_PRACTICE || [];
  const getSpeakingTopics = () => window.SPEAKING_TOPICS || [];
  const getVocabBank = () => window.VOCABULARY_BANK || [];

  // Persistent State in localStorage
  const STORAGE_KEY = 'hcmus_eng_2026_state_v1';
  const defaultState = {
    theme: 'dark',
    mobileFrame: false,
    activeTab: 'dashboard',
    selectedTestId: 'test-1',
    selectedPaper: 'paper1', // paper1, paper2, paper3, paper4, all
    examMode: 'study', // 'study' | 'mock'
    selectedWritingId: 'writing-1',
    selectedGrammarId: 'grammar-1',
    selectedSpeakingId: 'speaking-intro',
    selectedVocabFilter: 'all',
    vocabSearchQuery: '',
    vocabViewMode: 'flashcard', // 'flashcard' | 'list' | 'quiz'
    flashcardIndex: 0,
    flashcardFlipped: false,
    masteredVocab: {}, // id -> boolean
    vocabQuizIndex: 0,
    vocabQuizAnswers: {},
    ttsRate: 1.0,
    userAnswers: {}, // key -> selected option or typed string
    checkedWriting: {}, // key -> { isCorrect, userText }
    bookmarks: {}, // key -> { id, title, question, answer, explanation }
    mockHistory: [], // [{ testId, date, totalScore, p1, p2, p3, p4 }]
    speakingSelfScore: {} // testId -> number (0..20)
  };

  let state = Object.assign({}, defaultState, loadState());
  state.masteredVocab = state.masteredVocab || {};
  state.vocabQuizAnswers = state.vocabQuizAnswers || {};
  state.userAnswers = state.userAnswers || {};
  state.checkedWriting = state.checkedWriting || {};
  state.bookmarks = state.bookmarks || {};
  state.mockHistory = state.mockHistory || [];
  let examTimerInterval = null;
  let examSecondsRemaining = 110 * 60;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
    updateHeaderBadges();
  }

  // Normalize text for flexible Sentence Transformation grading
  function normalizeSentence(str, promptPrefix) {
    if (!str) return '';
    let s = str.trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '').trim().toLowerCase();
    const contractions = [
      [/\bisn't\b/g, 'is not'],
      [/\baren't\b/g, 'are not'],
      [/\bwasn't\b/g, 'was not'],
      [/\bweren't\b/g, 'were not'],
      [/\bdon't\b/g, 'do not'],
      [/\bdoesn't\b/g, 'does not'],
      [/\bdidn't\b/g, 'did not'],
      [/\bhaven't\b/g, 'have not'],
      [/\bhasn't\b/g, 'has not'],
      [/\bhadn't\b/g, 'had not'],
      [/\bwon't\b/g, 'will not'],
      [/\bwouldn't\b/g, 'would not'],
      [/\bcan't\b/g, 'cannot'],
      [/\bcannot\b/g, 'can not'],
      [/\bcouldn't\b/g, 'could not'],
      [/\bshouldn't\b/g, 'should not'],
      [/\bmustn't\b/g, 'must not'],
      [/\bneedn't\b/g, 'need not'],
      [/\bi'm\b/g, 'i am'],
      [/\byou're\b/g, 'you are'],
      [/\bwe're\b/g, 'we are'],
      [/\bthey're\b/g, 'they are'],
      [/\bhe's\b/g, 'he is'],
      [/\bshe's\b/g, 'she is'],
      [/\bit's\b/g, 'it is'],
      [/\bthat's\b/g, 'that is'],
      [/\bthere's\b/g, 'there is'],
      [/\bi've\b/g, 'i have'],
      [/\bwe've\b/g, 'we have'],
      [/\bthey've\b/g, 'they have'],
      [/\bi'll\b/g, 'i will'],
      [/\bhe'll\b/g, 'he will'],
      [/\bshe'll\b/g, 'she will'],
      [/\bwe'll\b/g, 'we will'],
      [/\byou'd better\b/g, 'you had better'],
      [/\bi'd\b/g, 'i would']
    ];
    contractions.forEach(([regex, rep]) => {
      s = s.replace(regex, rep);
    });
    return s;
  }

  function checkTransformationAnswer(userRaw, item) {
    if (!userRaw || !userRaw.trim()) return false;
    const pNorm = normalizeSentence(item.prompt || '');
    let uNorm = normalizeSentence(userRaw);
    // Allow user to either type the full sentence or just the part after the prompt
    const candidates = [
      ...(item.acceptedAnswers || []),
      item.fullSentence || ''
    ].filter(Boolean);

    for (const cand of candidates) {
      const cNorm = normalizeSentence(cand);
      if (uNorm === cNorm) return true;
      if (pNorm && (pNorm + ' ' + uNorm).trim() === cNorm) return true;
      // Also check without optional 'that' or 'should' in parentheses
      const cWithoutParens = normalizeSentence(cand.replace(/\([^)]*\)/g, ''));
      if (uNorm === cWithoutParens || (pNorm && (pNorm + ' ' + uNorm).trim() === cWithoutParens)) {
        return true;
      }
    }
    return false;
  }

  // Text-to-Speech Helper (supports native FlutterTTS channel on Android APK + Web Speech API)
  window.speakText = function (text, rateOverride) {
    const cleanText = text.replace(/^(Man|Woman|Interviewer|Nick|Simon|Abby|Maria|Angela|Britta|Speaker|Presenter|Host):\s*/gim, '');
    if (window.FlutterTTS && typeof window.FlutterTTS.postMessage === 'function') {
      window.FlutterTTS.postMessage(cleanText);
      return;
    }
    if (!('speechSynthesis' in window)) {
      alert('Trình duyệt của bạn không hỗ trợ đọc giọng nói (Web Speech API).');
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(cleanText);
    utter.lang = 'en-US';
    utter.rate = rateOverride || state.ttsRate || 1.0;
    const voices = window.speechSynthesis.getVoices();
    const enVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Microsoft'))) || voices.find(v => v.lang.startsWith('en'));
    if (enVoice) utter.voice = enVoice;
    window.speechSynthesis.speak(utter);
  };

  window.stopSpeech = function () {
    if (window.FlutterTTS && typeof window.FlutterTTS.postMessage === 'function') {
      window.FlutterTTS.postMessage('__STOP__');
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  window.setTtsRate = function (rate) {
    state.ttsRate = rate;
    saveState();
    render();
  };

  // Bookmark toggle
  window.toggleBookmark = function (key, title, question, answer, explanation) {
    if (state.bookmarks[key]) {
      delete state.bookmarks[key];
    } else {
      state.bookmarks[key] = { key, title, question, answer, explanation, savedAt: new Date().toLocaleDateString('vi-VN') };
    }
    saveState();
    render();
  };

  function updateHeaderBadges() {
    const count = Object.keys(state.bookmarks || {}).length;
    const el = document.getElementById('bookmarkCount');
    if (el) el.textContent = count;
    document.body.classList.toggle('theme-light', state.theme === 'light');
    document.body.classList.toggle('theme-dark', state.theme !== 'light');
    document.body.classList.toggle('mobile-frame-active', !!state.mobileFrame);
    const btnTheme = document.getElementById('btnTheme');
    if (btnTheme) btnTheme.textContent = state.theme === 'light' ? '☀️' : '🌙';
  }

  // Calculate overall statistics
  function computeStats() {
    const tests = getTests();
    let answeredMCQ = 0;
    let correctMCQ = 0;
    let totalTestQuestions = 0;

    tests.forEach(t => {
      const allMcq = [
        ...(t.paper1?.vocab || []),
        ...(t.paper1?.passages || []).flatMap(p => p.questions || []),
        ...(t.paper2?.grammar || []),
        ...(t.paper2?.cloze?.questions || []),
        ...(t.paper3?.shortConversations || []),
        ...(t.paper3?.longConversation?.questions || []),
        ...(t.paper3?.talk?.questions || [])
      ];
      totalTestQuestions += allMcq.length + (t.paper2?.transformation?.length || 0);
      allMcq.forEach(q => {
        const key = `${t.id}-q-${q.num}`;
        const ua = state.userAnswers[key];
        if (ua) {
          answeredMCQ++;
          if (ua === q.answer) correctMCQ++;
        }
      });
      (t.paper2?.transformation || []).forEach(tr => {
        const key = `${t.id}-q-${tr.num}`;
        if (state.checkedWriting[key]) {
          answeredMCQ++;
          if (state.checkedWriting[key].isCorrect) correctMCQ++;
        }
      });
    });

    // Grammar & Writing practice sets
    let grammarDone = 0;
    let grammarCorrect = 0;
    let totalGrammarQuestions = 0;
    getGrammarSets().forEach(set => {
      totalGrammarQuestions += (set.questions || []).length;
      (set.questions || []).forEach(q => {
        const key = `${set.id}-q-${q.num}`;
        if (state.userAnswers[key]) {
          grammarDone++;
          if (state.userAnswers[key] === q.answer) grammarCorrect++;
        }
      });
    });

    let writingDone = 0;
    let writingCorrect = 0;
    let totalWritingQuestions = 0;
    getWritingSets().forEach(set => {
      totalWritingQuestions += (set.questions || []).length;
      (set.questions || []).forEach(q => {
        const key = `${set.id}-q-${q.num}`;
        if (state.checkedWriting[key]) {
          writingDone++;
          if (state.checkedWriting[key].isCorrect) writingCorrect++;
        }
      });
    });

    const accuracy = answeredMCQ > 0 ? Math.round((correctMCQ / answeredMCQ) * 100) : 0;
    return {
      testsCount: tests.length,
      answeredMCQ,
      correctMCQ,
      totalTestQuestions,
      accuracy,
      grammarDone,
      grammarCorrect,
      totalGrammarQuestions,
      writingDone,
      writingCorrect,
      totalWritingQuestions,
      bookmarksCount: Object.keys(state.bookmarks || {}).length
    };
  }

  // Calculate official 100-point HCMUS score for a single test
  function calculateTestScore(test) {
    if (!test) return { p1: 0, p2: 0, p3: 0, p4: 15, total: 15 };
    // Paper 1: 20 questions -> 20 points (1.0 pt each)
    const p1Questions = [
      ...(test.paper1?.vocab || []),
      ...(test.paper1?.passages || []).flatMap(p => p.questions || [])
    ];
    let p1Correct = 0;
    p1Questions.forEach(q => {
      if (state.userAnswers[`${test.id}-q-${q.num}`] === q.answer) p1Correct++;
    });
    const p1Score = p1Questions.length ? (p1Correct / p1Questions.length) * 20 : 0;

    // Paper 2: 30 questions (15 grammar + 10 cloze + 5 transformation) -> 40 points
    const p2Mcq = [
      ...(test.paper2?.grammar || []),
      ...(test.paper2?.cloze?.questions || [])
    ];
    const p2Trans = test.paper2?.transformation || [];
    let p2Correct = 0;
    p2Mcq.forEach(q => {
      if (state.userAnswers[`${test.id}-q-${q.num}`] === q.answer) p2Correct++;
    });
    p2Trans.forEach(tr => {
      const key = `${test.id}-q-${tr.num}`;
      const typed = state.userAnswers[key] || '';
      if (state.checkedWriting[key]?.isCorrect || checkTransformationAnswer(typed, tr)) {
        p2Correct++;
      }
    });
    const p2TotalItems = p2Mcq.length + p2Trans.length;
    const p2Score = p2TotalItems ? (p2Correct / p2TotalItems) * 40 : 0;

    // Paper 3: 20 questions -> 20 points (1.0 pt each)
    const p3Questions = [
      ...(test.paper3?.shortConversations || []),
      ...(test.paper3?.longConversation?.questions || []),
      ...(test.paper3?.talk?.questions || [])
    ];
    let p3Correct = 0;
    p3Questions.forEach(q => {
      if (state.userAnswers[`${test.id}-q-${q.num}`] === q.answer) p3Correct++;
    });
    const p3Score = p3Questions.length ? (p3Correct / p3Questions.length) * 20 : 0;

    // Paper 4: Speaking (20 points - user self-assessed or default 14/20)
    const p4Score = state.speakingSelfScore[test.id] !== undefined ? Number(state.speakingSelfScore[test.id]) : 14;

    const total = Math.round((p1Score + p2Score + p3Score + p4Score) * 10) / 10;
    return {
      p1: Math.round(p1Score * 10) / 10,
      p1Correct,
      p1Total: p1Questions.length,
      p2: Math.round(p2Score * 10) / 10,
      p2Correct,
      p2Total: p2TotalItems,
      p3: Math.round(p3Score * 10) / 10,
      p3Correct,
      p3Total: p3Questions.length,
      p4: p4Score,
      total
    };
  }

  // ==================== VIEWS ====================

  function renderDashboard() {
    const stats = computeStats();
    const tests = getTests();
    const allVocab = getVocabBank();
    const masteredCount = Object.keys(state.masteredVocab || {}).filter(k => state.masteredVocab[k]).length;
    return `
      <div class="card" style="background: linear-gradient(135deg, #1e3a8a, #3b82f6); color: #fff; border: none;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px;">
          <div>
            <span class="chip" style="background:rgba(255,255,255,0.2); color:#fff; margin-bottom:8px;">🎯 Kỳ thi Tuyển sinh Thạc sĩ 2026 - Đợt 2</span>
            <h2 style="font-size:21px; font-weight:800; margin-bottom:4px;">Trường ĐH Khoa học Tự nhiên, ĐHQG-HCM</h2>
            <p style="font-size:13.5px; opacity:0.92;">Mục tiêu vượt qua: <strong>≥ 50 / 100 điểm</strong> (Không tính điểm liệt từng phần - Có mặt đủ 3 buổi/phần thi)</p>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn-primary" style="background:#fff; color:#1e3a8a; font-weight:700;" onclick="switchTab('vocab')">
              📖 Học Từ Vựng
            </button>
            <button class="btn-primary" style="background:#fbbf24; color:#0f172a; font-weight:700;" onclick="switchTab('tests')">
              🚀 Luyện Đề Ngay
            </button>
          </div>
        </div>
      </div>

      <div class="grid-4" style="margin-bottom: 14px;">
        <div class="stat-card">
          <div class="stat-value">${stats.answeredMCQ} / ${stats.totalTestQuestions}</div>
          <div class="stat-label">Câu đã làm trong 10 Đề</div>
        </div>
        <div class="stat-card" style="cursor:pointer;" onclick="switchTab('vocab')">
          <div class="stat-value" style="color: #60a5fa;">${masteredCount} / ${allVocab.length}</div>
          <div class="stat-label">Từ vựng đã thuộc (10 đề)</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.writingDone} / ${stats.totalWritingQuestions}</div>
          <div class="stat-label">Câu Viết lại câu (20 dạng)</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.grammarDone} / ${stats.totalGrammarQuestions}</div>
          <div class="stat-label">Câu Ngữ pháp chuyên sâu</div>
        </div>
      </div>

      <div class="grid-2">
        <!-- Official Exam Structure Card -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">📋 Cấu trúc đề thi chuẩn ĐH KHTN</h3>
            <span class="chip chip-success">Thang điểm 100</span>
          </div>
          <p style="font-size:13px; color:var(--text-secondary); margin-bottom:8px;">
            Thời lượng: <strong>Đọc - Viết (90 phút)</strong> • <strong>Nghe (~20 phút)</strong> • <strong>Nói (~15 phút/thí sinh)</strong>
          </p>
          <table class="structure-table">
            <thead>
              <tr>
                <th>Phần thi (Paper)</th>
                <th>Cấu trúc chi tiết</th>
                <th>Điểm</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Paper 1: Reading & Vocab</strong></td>
                <td>Part A: Vocabulary (10 câu)<br/>Part B: 2 Reading Passages (10 câu)</td>
                <td><strong>20 đ</strong></td>
              </tr>
              <tr>
                <td><strong>Paper 2: Grammar & Writing</strong> <span class="chip chip-warning">Trọng tâm</span></td>
                <td>Part A: Sentence Completion (15 câu)<br/>Part B: Cloze Test (10 câu)<br/>Part C: Sentence Transformation (5 câu)</td>
                <td><strong>40 đ</strong></td>
              </tr>
              <tr>
                <td><strong>Paper 3: Listening</strong></td>
                <td>Part A: Short conversations (10 câu)<br/>Part B: Long conversation (5 câu)<br/>Part C: Talk (5 câu)</td>
                <td><strong>20 đ</strong></td>
              </tr>
              <tr>
                <td><strong>Paper 4: Speaking</strong></td>
                <td>Part A: Self-introduction (5đ)<br/>Part B: Guided conversation theo chủ đề (15đ)</td>
                <td><strong>20 đ</strong></td>
              </tr>
            </tbody>
          </table>
          <div class="explanation-box" style="margin-top:12px;">
            💡 <strong>Chiến thuật đạt ≥ 65/100 điểm dễ nhất:</strong><br/>
            • <strong>Paper 2 chiếm tới 40 điểm</strong> (mỗi câu ~1.33 điểm) và các câu <em>Grammar + Viết lại câu</em> lặp lại đúng 20 công thức ở trang 71–79!<br/>
            • <strong>Paper 4 (Speaking - 20 điểm)</strong> chỉ xoay quanh phần Tự giới thiệu bản thân (5đ) và 9 chủ đề quen thuộc có sẵn trong đề cương. Học thuộc dàn ý là nắm chắc 15–18 điểm!
          </div>
        </div>

        <!-- Quick Roadmap & Progress -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">🗺️ Lộ trình ôn tập thông minh trên App</h3>
          </div>
          <div style="display:flex; flex-direction:column; gap:10px;">
            <div class="question-card" style="margin-bottom:0; cursor:pointer;" onclick="switchTab('vocab')">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong>⭐ Nắm chắc 190 Từ Vựng & Collocation Trọng Tâm</strong>
                <span class="chip chip-success">Flashcard 2 mặt</span>
              </div>
              <p style="font-size:13px; color:var(--text-secondary); margin-top:4px;">
                Học từ vựng trích trực tiếp từ 10 đề thi, kèm phát âm AI 🔊, ví dụ thực tế và các từ dễ gây nhầm lẫn.
              </p>
            </div>

            <div class="question-card" style="margin-bottom:0; cursor:pointer;" onclick="switchTab('writing')">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong>1️⃣ Nắm trọn 20 Chuyên đề Viết lại câu (Paper 2 - Part C)</strong>
                <span class="chip">${stats.totalWritingQuestions} câu tự luận</span>
              </div>
              <p style="font-size:13px; color:var(--text-secondary); margin-top:4px;">
                Luyện gõ trực tiếp 20 công thức biến đổi câu (Despite/Although, Wish, If/Unless, Causative, Câu gián tiếp...).
              </p>
            </div>

            <div class="question-card" style="margin-bottom:0; cursor:pointer;" onclick="switchTab('grammar')">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong>2️⃣ Luyện ${stats.totalGrammarQuestions} câu Ngữ pháp Sau đại học (Paper 2 - Part A)</strong>
                <span class="chip">3 bộ chuyên sâu</span>
              </div>
              <p style="font-size:13px; color:var(--text-secondary); margin-top:4px;">
                Nắm chắc mệnh đề quan hệ rút gọn, đảo ngữ, phân từ (V-ing/V-ed) hay bẫy trong đề thi.
              </p>
            </div>

            <div class="question-card" style="margin-bottom:0; cursor:pointer;" onclick="switchTab('speaking')">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong>3️⃣ Học bài mẫu Speaking 10 Chủ đề (Paper 4 - 20 điểm)</strong>
                <span class="chip chip-success">Có phát âm AI</span>
              </div>
              <p style="font-size:13px; color:var(--text-secondary); margin-top:4px;">
                Có sẵn bài mẫu <em>Self-introduction</em> + 9 chủ đề bốc thăm kèm câu hỏi phụ của giám khảo và bấm giờ 5 phút.
              </p>
            </div>

            <div class="question-card" style="margin-bottom:0; cursor:pointer;" onclick="switchTab('tests')">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong>4️⃣ Giải chi tiết & Thi thử 10 Đề (Practice Tests 1–10)</strong>
                <span class="chip chip-warning">700 câu hỏi</span>
              </div>
              <p style="font-size:13px; color:var(--text-secondary); margin-top:4px;">
                Chế độ Học (hiện dịch bài đọc, phân tích A/B/C/D chi tiết) hoặc Thi thử bấm giờ chấm thang điểm 100.
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Quick Test Score Overview -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">📊 Bảng điểm ước tính 10 Đề Thi Thử (Practice Tests 1–10)</h3>
          <button class="btn-outline btn-sm" onclick="resetAllProgress()">🗑️ Xóa làm lại từ đầu</button>
        </div>
        <div class="grid-3">
          ${tests.map(t => {
            const sc = calculateTestScore(t);
            const passed = sc.total >= 50;
            return `
              <div class="question-card" style="margin-bottom:0; cursor:pointer;" onclick="openTest('${t.id}')">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                  <strong>${t.title}</strong>
                  <span class="chip ${passed ? 'chip-success' : 'chip-warning'}">${sc.total} / 100 đ</span>
                </div>
                <div style="font-size:12px; color:var(--text-secondary);">
                  • P1 (Đọc): <strong>${sc.p1}/20</strong> (${sc.p1Correct}/${sc.p1Total})<br/>
                  • P2 (Ngữ pháp/Viết): <strong>${sc.p2}/40</strong> (${sc.p2Correct}/${sc.p2Total})<br/>
                  • P3 (Nghe): <strong>${sc.p3}/20</strong> (${sc.p3Correct}/${sc.p3Total})<br/>
                  • P4 (Chủ đề Nói): <em>${t.speakingTopic || 'Speaking'}</em>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  // ==================== VOCABULARY VIEW ====================

  function getFilteredVocab() {
    const list = getVocabBank();
    const query = (state.vocabSearchQuery || '').trim().toLowerCase();
    const filter = state.selectedVocabFilter || 'all';

    return list.filter(item => {
      if (filter !== 'all') {
        if (filter.startsWith('test-')) {
          const testNum = filter.replace('test-', '');
          const matchTest = (item.testRef || '').toLowerCase().includes('test ' + testNum);
          if (!matchTest) return false;
        } else if (filter === 'grammar') {
          if (!(item.testRef || '').toLowerCase().includes('ngữ pháp')) return false;
        } else if (filter === 'mastered') {
          if (!state.masteredVocab[item.id]) return false;
        } else if (filter === 'unmastered') {
          if (state.masteredVocab[item.id]) return false;
        }
      }

      if (query) {
        const inWord = (item.word || '').toLowerCase().includes(query);
        const inMeaning = (item.meaning || '').toLowerCase().includes(query);
        const inExample = (item.example || '').toLowerCase().includes(query);
        const inCollocation = (item.collocation || '').toLowerCase().includes(query);
        if (!inWord && !inMeaning && !inExample && !inCollocation) return false;
      }

      return true;
    });
  }

  function renderVocabView() {
    const allVocab = getVocabBank();
    const filtered = getFilteredVocab();
    const masteredCount = Object.keys(state.masteredVocab || {}).filter(k => state.masteredVocab[k]).length;
    const mode = state.vocabViewMode || 'flashcard';

    return `
      <!-- Header Stats & Search -->
      <div class="card" style="background: linear-gradient(135deg, #1e3a8a, #0284c7); color: #fff; border:none;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div>
            <h2 style="font-size:20px; font-weight:800;">📖 Ngân Hàng Từ Vựng Trọng Tâm 10 Đề Thi HCMUS</h2>
            <p style="font-size:13px; opacity:0.92; margin-top:2px;">
              Kho ${allVocab.length} từ vựng, phrasal verbs, collocations và liên từ xuất hiện trực tiếp trong đề thi Thạc sĩ
            </p>
          </div>
          <div style="display:flex; gap:10px;">
            <span class="chip" style="background:rgba(255,255,255,0.2); color:#fff; font-size:12px;">⭐ Đã thuộc: ${masteredCount}</span>
            <span class="chip" style="background:rgba(255,255,255,0.2); color:#fff; font-size:12px;">🔄 Cần ôn: ${Math.max(0, allVocab.length - masteredCount)}</span>
          </div>
        </div>
      </div>

      <!-- Controls & Search -->
      <div class="card" style="padding:14px;">
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; justify-content:space-between; margin-bottom:12px;">
          <div style="flex:1; min-width:260px; display:flex; gap:8px;">
            <input
              type="text"
              id="vocabSearchInput"
              class="text-input"
              placeholder="🔍 Tìm từ tiếng Anh hoặc nghĩa tiếng Việt..."
              value="${(state.vocabSearchQuery || '').replace(/"/g, '&quot;')}"
              oninput="setVocabSearch(this.value)"
            />
            ${state.vocabSearchQuery ? `<button class="btn-outline btn-sm" onclick="setVocabSearch('')">✕</button>` : ''}
          </div>
          <div style="display:flex; gap:6px;">
            <button class="pill-btn ${mode === 'flashcard' ? 'active' : ''}" onclick="setVocabMode('flashcard')">🃏 Flashcards</button>
            <button class="pill-btn ${mode === 'list' ? 'active' : ''}" onclick="setVocabMode('list')">📋 Danh sách tra cứu</button>
            <button class="pill-btn ${mode === 'quiz' ? 'active' : ''}" onclick="setVocabMode('quiz')">🎯 Trắc nghiệm phản xạ</button>
          </div>
        </div>

        <!-- Filter Pills -->
        <div class="pill-bar" style="margin-bottom:0;">
          <button class="pill-btn ${state.selectedVocabFilter === 'all' ? 'active' : ''}" onclick="setVocabFilter('all')">Tất cả (${allVocab.length})</button>
          <button class="pill-btn ${state.selectedVocabFilter === 'mastered' ? 'active' : ''}" onclick="setVocabFilter('mastered')">⭐ Đã thuộc (${masteredCount})</button>
          <button class="pill-btn ${state.selectedVocabFilter === 'unmastered' ? 'active' : ''}" onclick="setVocabFilter('unmastered')">🔄 Cần ôn (${Math.max(0, allVocab.length - masteredCount)})</button>
          <button class="pill-btn ${state.selectedVocabFilter === 'grammar' ? 'active' : ''}" onclick="setVocabFilter('grammar')">Liên từ & Bẫy ngữ pháp</button>
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `
            <button class="pill-btn ${state.selectedVocabFilter === 'test-' + n ? 'active' : ''}" onclick="setVocabFilter('test-${n}')">Test ${n}</button>
          `).join('')}
        </div>
      </div>

      <!-- Mode Content -->
      ${mode === 'flashcard' ? renderVocabFlashcard(filtered) : ''}
      ${mode === 'list' ? renderVocabList(filtered) : ''}
      ${mode === 'quiz' ? renderVocabQuiz(filtered) : ''}
    `;
  }

  function renderVocabFlashcard(filtered) {
    if (!filtered || !filtered.length) {
      return `<div class="card" style="text-align:center; padding:32px;">Không tìm thấy từ vựng phù hợp với bộ lọc hiện tại.</div>`;
    }
    const idx = Math.min(Math.max(0, state.flashcardIndex || 0), filtered.length - 1);
    const item = filtered[idx];
    const isMastered = !!state.masteredVocab[item.id];
    const isFlipped = !!state.flashcardFlipped;

    return `
      <div class="flashcard-wrapper" onclick="toggleFlipFlashcard()">
        <div class="flashcard-inner ${isFlipped ? 'is-flipped' : ''}">
          <!-- Front Face -->
          <div class="flashcard-front">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span class="chip">${item.testRef || 'HCMUS'}</span>
              <span style="font-size:12px; color:var(--text-secondary);">Thẻ ${idx + 1} / ${filtered.length}</span>
            </div>
            <div style="text-align:center; padding:18px 0;">
              <div class="flashcard-word">${item.word}</div>
              <div class="flashcard-ipa">${item.type} ${item.phonetic || ''}</div>
              <button class="icon-btn" style="margin-top:10px;" onclick="event.stopPropagation(); speakText('${item.word.replace(/'/g, "\\'")}')">
                🔊 Phát âm chuẩn
              </button>
            </div>
            <div style="border-top:1px dashed var(--border); padding-top:10px; font-size:13.5px; color:var(--text-secondary); text-align:center;">
              <strong>Câu ví dụ trong đề:</strong><br/>
              <em>"${(item.example || '').replace(new RegExp('\\b' + item.word + '\\b', 'gi'), '<strong style=\"color:#60a5fa;\">$&</strong>')}"</em>
              <div style="font-size:11.5px; color:var(--text-muted); margin-top:8px;">👆 Chạm vào thẻ để lật xem nghĩa & phân tích</div>
            </div>
          </div>

          <!-- Back Face -->
          <div class="flashcard-back">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span class="chip chip-success">${item.topic || 'Từ vựng trọng tâm'}</span>
              <button class="icon-btn btn-sm" onclick="event.stopPropagation(); toggleMasteredVocab('${item.id}')">
                ${isMastered ? '⭐ Đã thuộc' : '☆ Đánh dấu đã thuộc'}
              </button>
            </div>
            <div style="padding:10px 0;">
              <div class="flashcard-meaning">${item.meaning}</div>
              ${item.collocation ? `<div style="font-size:13.5px; margin-bottom:8px;"><strong>Cụm từ hay gặp:</strong> <code style="color:#fbbf24;">${item.collocation}</code></div>` : ''}
              <div style="font-size:13px; color:#cbd5e1; font-style:italic;">"${item.exampleVi || ''}"</div>
            </div>
            ${item.distractors && item.distractors.length ? `
              <div style="background:rgba(0,0,0,0.25); border-radius:10px; padding:8px 12px; font-size:12px;">
                <strong style="color:#f87171;">⚠️ Các từ dễ gây nhầm lẫn:</strong><br/>
                ${item.distractors.map(d => `• <strong>${d.word}</strong>: ${d.meaning}`).join('<br/>')}
              </div>
            ` : '<div style="font-size:11.5px; color:var(--text-muted); text-align:center;">👆 Chạm để lật lại mặt trước</div>'}
          </div>
        </div>
      </div>

      <!-- Flashcard Controls -->
      <div class="flashcard-nav">
        <button class="btn-outline" onclick="prevFlashcard(${filtered.length})">⬅️ Thẻ trước</button>
        <button class="btn-primary" onclick="toggleMasteredVocab('${item.id}')">
          ${isMastered ? '✓ Đã thuộc' : '⭐ Đánh dấu đã thuộc'}
        </button>
        <button class="btn-outline" onclick="shuffleFlashcards(${filtered.length})">🔀 Trộn ngẫu nhiên</button>
        <button class="btn-primary" onclick="nextFlashcard(${filtered.length})">Thẻ tiếp ➡️</button>
      </div>
    `;
  }

  function renderVocabList(filtered) {
    if (!filtered || !filtered.length) {
      return `<div class="card" style="text-align:center; padding:32px;">Không có từ vựng nào khớp với tìm kiếm.</div>`;
    }
    return `
      <div class="card" style="margin-bottom:12px;">
        <span style="font-size:13px; color:var(--text-secondary);">Hiển thị <strong>${filtered.length}</strong> từ vựng</span>
      </div>
      <div class="grid-2">
        ${filtered.map(item => {
          const isMastered = !!state.masteredVocab[item.id];
          return `
            <div class="vocab-list-item">
              <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                  <strong style="font-size:18px; color:var(--accent);">${item.word}</strong>
                  <span style="font-size:13px; color:var(--text-secondary); margin-left:6px;">${item.type} ${item.phonetic || ''}</span>
                </div>
                <div style="display:flex; gap:6px;">
                  <button class="icon-btn btn-sm" onclick="speakText('${item.word.replace(/'/g, "\\'")}')">🔊</button>
                  <button class="icon-btn btn-sm" onclick="toggleMasteredVocab('${item.id}')">
                    ${isMastered ? '⭐' : '☆'}
                  </button>
                </div>
              </div>
              <div style="font-size:14.5px; font-weight:700; color:var(--success); margin:6px 0;">${item.meaning}</div>
              ${item.collocation ? `<div style="font-size:12.5px; margin-bottom:4px;"><strong>Collocation:</strong> <code>${item.collocation}</code></div>` : ''}
              <div style="font-size:13px; color:var(--text-secondary); font-style:italic;">"${item.example || ''}"</div>
              <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">"${item.exampleVi || ''}"</div>
              <div style="margin-top:8px; display:flex; justify-content:space-between; align-items:center;">
                <span class="chip" style="font-size:10.5px;">${item.testRef || ''}</span>
                <span style="font-size:11px; color:var(--text-muted);">${item.topic || ''}</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderVocabQuiz(filtered) {
    if (!filtered || filtered.length < 4) {
      return `<div class="card" style="text-align:center; padding:32px;">Cần ít nhất 4 từ vựng để tạo bài trắc nghiệm. Vui lòng chọn bộ lọc khác.</div>`;
    }
    const qIdx = Math.min(state.vocabQuizIndex || 0, filtered.length - 1);
    const curr = filtered[qIdx];
    const otherItems = filtered.filter(x => x.id !== curr.id);
    const shuffledOthers = otherItems.slice(0, 3);
    const quizOptions = [curr, ...shuffledOthers].sort(() => (curr.id > otherItems[0].id ? 0.3 : -0.3));
    const userChoice = state.vocabQuizAnswers[curr.id];

    return `
      <div class="card" style="max-width:600px; margin:0 auto;">
        <div class="card-header">
          <span class="chip chip-warning">Câu ${qIdx + 1} / ${filtered.length}</span>
          <button class="btn-outline btn-sm" onclick="resetVocabQuiz()">Làm lại từ đầu</button>
        </div>
        <div style="text-align:center; padding:16px 0;">
          <div style="font-size:14px; color:var(--text-secondary);">Từ tiếng Anh:</div>
          <div style="font-size:28px; font-weight:800; color:var(--accent); margin:4px 0;">${curr.word}</div>
          <div style="font-size:14px; color:var(--text-muted);">${curr.type} ${curr.phonetic || ''}</div>
          <button class="icon-btn btn-sm" style="margin-top:6px;" onclick="speakText('${curr.word.replace(/'/g, "\\'")}')">🔊 Nghe phát âm</button>
        </div>

        <div style="margin-top:12px; font-weight:600; font-size:14.5px;">Chọn nghĩa tiếng Việt chính xác nhất:</div>
        <div style="display:flex; flex-direction:column; gap:8px; margin-top:10px;">
          ${quizOptions.map((opt, i) => {
            const letter = String.fromCharCode(65 + i);
            let cls = 'opt-btn';
            if (userChoice) {
              if (opt.id === curr.id) cls += ' correct';
              else if (userChoice === opt.id) cls += ' wrong';
            }
            return `
              <button class="${cls}" onclick="answerVocabQuiz('${curr.id}', '${opt.id}')">
                <span><strong>${letter}.</strong> ${opt.meaning}</span>
                ${userChoice && opt.id === curr.id ? '<span>✓</span>' : ''}
                ${userChoice && userChoice === opt.id && opt.id !== curr.id ? '<span>✗</span>' : ''}
              </button>
            `;
          }).join('')}
        </div>

        ${userChoice ? `
          <div class="explanation-box" style="margin-top:16px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <strong style="color:${userChoice === curr.id ? 'var(--success)' : 'var(--danger)'};">
                ${userChoice === curr.id ? '🎉 Chính xác!' : '⚠️ Chưa đúng!'}
              </strong>
              <button class="btn-primary btn-sm" onclick="nextVocabQuiz(${filtered.length})">Câu tiếp theo ➡️</button>
            </div>
            <div style="margin-top:8px;">
              • <strong>${curr.word}</strong>: ${curr.meaning}<br/>
              • <strong>Ví dụ trong đề:</strong> <em>"${curr.example}"</em> (${curr.exampleVi})
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  window.setVocabFilter = function (f) {
    state.selectedVocabFilter = f;
    state.flashcardIndex = 0;
    state.flashcardFlipped = false;
    saveState();
    render();
  };

  window.setVocabSearch = function (q) {
    state.vocabSearchQuery = q;
    state.flashcardIndex = 0;
    saveState();
    render();
  };

  window.setVocabMode = function (m) {
    state.vocabViewMode = m;
    state.flashcardFlipped = false;
    saveState();
    render();
  };

  window.toggleFlipFlashcard = function () {
    state.flashcardFlipped = !state.flashcardFlipped;
    render();
  };

  window.nextFlashcard = function (max) {
    state.flashcardIndex = (state.flashcardIndex + 1) % max;
    state.flashcardFlipped = false;
    render();
  };

  window.prevFlashcard = function (max) {
    state.flashcardIndex = (state.flashcardIndex - 1 + max) % max;
    state.flashcardFlipped = false;
    render();
  };

  window.shuffleFlashcards = function (max) {
    state.flashcardIndex = Math.floor(Math.random() * max);
    state.flashcardFlipped = false;
    render();
  };

  window.toggleMasteredVocab = function (id) {
    state.masteredVocab[id] = !state.masteredVocab[id];
    saveState();
    render();
  };

  window.answerVocabQuiz = function (currId, choiceId) {
    state.vocabQuizAnswers[currId] = choiceId;
    saveState();
    render();
  };

  window.nextVocabQuiz = function (max) {
    state.vocabQuizIndex = (state.vocabQuizIndex + 1) % max;
    saveState();
    render();
  };

  window.resetVocabQuiz = function () {
    state.vocabQuizIndex = 0;
    state.vocabQuizAnswers = {};
    saveState();
    render();
  };

  // ==================== 10 PRACTICE TESTS VIEW ====================

  function renderTestsView() {
    const tests = getTests();
    const currentTest = tests.find(t => t.id === state.selectedTestId) || tests[0];
    if (!currentTest) {
      return `<div class="card">Đang tải dữ liệu đề thi...</div>`;
    }
    const sc = calculateTestScore(currentTest);

    return `
      <!-- Test Selector Bar -->
      <div class="pill-bar">
        ${tests.map(t => `
          <button class="pill-btn ${t.id === currentTest.id ? 'active' : ''}" onclick="selectTest('${t.id}')">
            ${t.title}
          </button>
        `).join('')}
      </div>

      <!-- Test Control Header -->
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div>
            <h2 style="font-size:19px; font-weight:800;">${currentTest.title} — Chủ đề Nói: ${currentTest.speakingTopic || ''}</h2>
            <p style="font-size:13px; color:var(--text-secondary);">
              Điểm hiện tại: <strong style="color:var(--accent);">${sc.total} / 100 điểm</strong> 
              (Paper 1: ${sc.p1}/20đ • Paper 2: ${sc.p2}/40đ • Paper 3: ${sc.p3}/20đ • Paper 4: ${sc.p4}/20đ)
            </p>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn-outline btn-sm ${state.examMode === 'study' ? 'selected' : ''}" onclick="setExamMode('study')">
              📖 Chế độ Học (Giải chi tiết)
            </button>
            <button class="btn-primary btn-sm" onclick="startMockExam('${currentTest.id}')">
              ⏱️ Thi thử bấm giờ (110 phút)
            </button>
          </div>
        </div>

        <!-- Paper Selector Sub-tabs -->
        <div class="pill-bar" style="margin-top:12px; margin-bottom:0;">
          <button class="pill-btn ${state.selectedPaper === 'paper1' ? 'active' : ''}" onclick="selectPaper('paper1')">
            Paper 1: Reading & Vocab (20đ)
          </button>
          <button class="pill-btn ${state.selectedPaper === 'paper2' ? 'active' : ''}" onclick="selectPaper('paper2')">
            Paper 2: Grammar & Writing (40đ)
          </button>
          <button class="pill-btn ${state.selectedPaper === 'paper3' ? 'active' : ''}" onclick="selectPaper('paper3')">
            Paper 3: Listening (20đ)
          </button>
          <button class="pill-btn ${state.selectedPaper === 'paper4' ? 'active' : ''}" onclick="selectPaper('paper4')">
            Paper 4: Speaking (20đ)
          </button>
        </div>
      </div>

      ${renderSelectedPaperContent(currentTest)}
    `;
  }

  function renderSelectedPaperContent(test) {
    if (state.selectedPaper === 'paper1') {
      return renderPaper1(test);
    } else if (state.selectedPaper === 'paper2') {
      return renderPaper2(test);
    } else if (state.selectedPaper === 'paper3') {
      return renderPaper3(test);
    } else {
      return renderPaper4(test);
    }
  }

  function renderMcqCard(prefixId, q, labelPrefix) {
    const key = `${prefixId}-q-${q.num}`;
    const userAns = state.userAnswers[key];
    const isStudy = state.examMode === 'study';
    const isBookmarked = !!state.bookmarks[key];
    const safeQuestion = (q.question || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const safeExp = (q.explanation || '').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\r?\n/g, ' ');

    return `
      <div class="question-card" id="card-${key}">
        <div class="question-header">
          <span class="q-num">Câu ${q.num}</span>
          <div class="q-text">${q.question}</div>
          <button class="icon-btn btn-sm" title="Lưu vào sổ tay câu khó" onclick="toggleBookmark('${key}', '${labelPrefix} - Câu ${q.num}', '${safeQuestion}', '${q.answer}', '${safeExp}')">
            ${isBookmarked ? '⭐ Đã lưu' : '☆ Lưu'}
          </button>
        </div>
        <div class="options-list">
          ${(q.options || []).map(opt => {
            const letter = opt.trim().charAt(0).replace(/[^A-D]/i, '').toUpperCase();
            let cls = 'opt-btn';
            if (userAns === letter) {
              if (isStudy) {
                cls += letter === q.answer ? ' correct' : ' wrong';
              } else {
                cls += ' selected';
              }
            } else if (isStudy && userAns && letter === q.answer) {
              cls += ' correct';
            }
            return `
              <button class="${cls}" onclick="answerMcq('${key}', '${letter}')">
                <span>${opt}</span>
                ${isStudy && userAns && letter === q.answer ? '<span>✓</span>' : ''}
                ${isStudy && userAns === letter && letter !== q.answer ? '<span>✗</span>' : ''}
              </button>
            `;
          }).join('')}
        </div>
        ${isStudy && userAns ? renderExplanationBox(q, userAns) : ''}
      </div>
    `;
  }

  function renderExplanationBox(q, userAns) {
    const raw = q.explanation || '';
    if (!raw.trim()) return '';

    let content = raw;
    const hasDich = /Dịch câu|Dịch nghĩa/i.test(raw);
    const hasPhanTich = /Phân tích từng phương án|Phân tích chi tiết/i.test(raw);
    const hasGhiChu = /Ghi chú|Cấu trúc cần nhớ|Công thức/i.test(raw);

    if (hasDich || hasPhanTich || hasGhiChu || /•\s*[A-D]\./.test(raw) || /-\s*[A-D]\./.test(raw)) {
      content = content
        .replace(/(?:•\s*|<strong>)?(Dịch câu|Dịch nghĩa)(?:<\/strong>)?:\s*/gi, '<div class="exp-section"><span class="exp-badge exp-badge-translation">🇻🇳 Dịch câu hỏi</span><div style="margin-top:2px; font-style:italic; color:var(--text-primary);">')
        .replace(/(?:•\s*|<strong>)?(Phân tích từng phương án|Phân tích chi tiết)(?:<\/strong>)?:\s*/gi, '</div></div><div class="exp-section"><span class="exp-badge exp-badge-analysis">🔍 Phân tích các phương án</span><div style="margin-top:4px;">')
        .replace(/(?:•\s*|<strong>)?(Ghi chú \/ Cấu trúc cần nhớ|Cấu trúc cần nhớ|Ghi chú|Công thức)(?:<\/strong>)?:\s*/gi, '</div></div><div class="exp-section"><span class="exp-badge exp-badge-takeaway">💡 Điểm ngữ pháp / Collocation cần nhớ</span><div style="margin-top:2px;">');
      
      content = content.replace(/(?:<br\s*\/?>|\n)?[-•]\s*([A-D])\.\s*([^:\n<]+)?:\s*([^\n<]+(?:<br\s*\/?>)?)/gi, (m, letter, label, desc) => {
        const isCorrect = letter.toUpperCase() === q.answer.toUpperCase();
        return `<div class="option-analysis-item ${isCorrect ? 'is-correct' : 'is-wrong'}">
          <strong>${letter}. ${label ? label + ': ' : ''}</strong>${isCorrect ? '<span style="color:var(--success); font-weight:700;">[ĐÚNG]</span> ' : '<span style="color:var(--danger); font-weight:700;">[SAI]</span> '}${desc}
        </div>`;
      });
      content += '</div></div>';
    }

    return `
      <div class="explanation-box">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid var(--border); padding-bottom:6px;">
          <strong style="color:var(--success); font-size:15px;">🎯 Đáp án chuẩn: ${q.answer}</strong>
          <span style="font-size:12px; color:var(--text-secondary);">${userAns === q.answer ? '🎉 Bạn làm đúng!' : '⚠️ Bạn đã chọn: ' + (userAns || 'Chưa làm')}</span>
        </div>
        ${content}
      </div>
    `;
  }

  function renderPaper1(test) {
    const vocab = test.paper1?.vocab || [];
    const passages = test.paper1?.passages || [];
    return `
      <div class="card">
        <h3 class="card-title">PART A: VOCABULARY (Câu 1 – 10 • 10 điểm)</h3>
        <p style="font-size:13px; color:var(--text-secondary);">Chọn từ hoặc cụm từ phù hợp nhất để hoàn thành câu.</p>
      </div>
      ${vocab.map(q => renderMcqCard(test.id, q, `${test.title} Vocab`)).join('')}

      <div class="card" style="margin-top:18px;">
        <h3 class="card-title">PART B: READING PASSAGES (Câu 11 – 20 • 10 điểm)</h3>
        <p style="font-size:13px; color:var(--text-secondary);">Đọc 2 đoạn văn dưới đây và trả lời các câu hỏi đi kèm.</p>
      </div>
      ${passages.map((p, idx) => `
        <div class="card">
          <div class="card-header">
            <h4 class="card-title">📖 ${p.title}</h4>
            <div style="display:flex; gap:8px;">
              <button class="btn-outline btn-sm" onclick="speakText(\`${(p.text || '').replace(/`/g, "'")}\`)">🔊 Nghe đoạn văn</button>
              <button class="btn-outline btn-sm" onclick="stopSpeech()">⏹ Dừng</button>
              <button class="btn-outline btn-sm" onclick="toggleElement('trans-${test.id}-p-${idx}')">🇻🇳 Xem/Ẩn Dịch nghĩa</button>
            </div>
          </div>
          <div class="passage-box">${p.text}</div>
          <div id="trans-${test.id}-p-${idx}" class="translation-box hidden">
            <strong>Bản dịch tiếng Việt:</strong><br/>${p.translation || ''}
          </div>
          <div style="margin-top:12px;">
            ${(p.questions || []).map(q => renderMcqCard(test.id, q, `${test.title} Reading`)).join('')}
          </div>
        </div>
      `).join('')}
    `;
  }

  function renderPaper2(test) {
    const grammar = test.paper2?.grammar || [];
    const cloze = test.paper2?.cloze || {};
    const trans = test.paper2?.transformation || [];
    return `
      <div class="card">
        <h3 class="card-title">PART A: SENTENCE COMPLETION (Câu 21 – 35 • 20 điểm)</h3>
        <p style="font-size:13px; color:var(--text-secondary);">Hoàn thành câu với cấu trúc ngữ pháp chính xác nhất.</p>
      </div>
      ${grammar.map(q => renderMcqCard(test.id, q, `${test.title} Grammar`)).join('')}

      <div class="card" style="margin-top:18px;">
        <div class="card-header">
          <div>
            <h3 class="card-title">PART B: CLOZE TEST — ${cloze.title || ''} (Câu 36 – 45 • 13.3 điểm)</h3>
            <p style="font-size:13px; color:var(--text-secondary);">Chọn từ thích hợp điền vào chỗ trống từ (36) đến (45).</p>
          </div>
          <button class="btn-outline btn-sm" onclick="toggleElement('cloze-trans-${test.id}')">🇻🇳 Xem/Ẩn Dịch bài đục lỗ</button>
        </div>
        <div class="passage-box">${cloze.text || ''}</div>
        <div id="cloze-trans-${test.id}" class="translation-box hidden">
          <strong>Bản dịch tiếng Việt:</strong><br/>${cloze.translation || ''}
        </div>
        <div style="margin-top:12px;">
          ${(cloze.questions || []).map(q => renderMcqCard(test.id, q, `${test.title} Cloze`)).join('')}
        </div>
      </div>

      <div class="card" style="margin-top:18px;">
        <h3 class="card-title">PART C: SENTENCE TRANSFORMATION (Câu 46 – 50 • 6.7 điểm)</h3>
        <p style="font-size:13px; color:var(--text-secondary);">Viết lại câu sao cho nghĩa không đổi, bắt đầu bằng từ gợi ý.</p>
      </div>
      ${trans.map(item => renderTransformationCard(test.id, item, `${test.title} Writing`)).join('')}
    `;
  }

  function renderTransformationCard(prefixId, item, labelPrefix) {
    const key = `${prefixId}-q-${item.num}`;
    const savedText = state.userAnswers[key] || '';
    const checkResult = state.checkedWriting[key];
    const isStudy = state.examMode === 'study';

    return `
      <div class="question-card" id="card-${key}">
        <div class="question-header">
          <span class="q-num">Câu ${item.num}</span>
          <div class="q-text">${item.original}</div>
        </div>
        <div class="transform-input-group">
          <div class="transform-prompt">Gợi ý đầu câu: <strong>${item.prompt} ...</strong></div>
          <div class="transform-input-row">
            <input
              type="text"
              id="input-${key}"
              class="text-input"
              placeholder="Gõ cả câu hoàn chỉnh hoặc phần tiếp theo sau '${item.prompt}'..."
              value="${savedText.replace(/"/g, '&quot;')}"
              oninput="saveWritingDraft('${key}', this.value)"
              onkeydown="if(event.key==='Enter') checkWritingItem('${prefixId}', ${item.num})"
            />
            <button class="btn-primary btn-sm" onclick="checkWritingItem('${prefixId}', ${item.num})">✓ Kiểm tra</button>
            <button class="btn-outline btn-sm" onclick="showWritingAnswer('${key}')">💡 Xem đáp án</button>
          </div>
        </div>
        ${isStudy && checkResult ? `
          <div class="explanation-box" style="border-left-color: ${checkResult.isCorrect ? 'var(--success)' : 'var(--danger)'};">
            <strong style="color: ${checkResult.isCorrect ? 'var(--success)' : 'var(--danger)'};">
              ${checkResult.isCorrect ? '🎉 Chính xác!' : '⚠️ Chưa khớp hoàn toàn — Hãy đối chiếu đáp án chuẩn bên dưới:'}
            </strong><br/>
            • <strong>Câu hoàn chỉnh:</strong> <span style="color:var(--accent); font-weight:700;">${item.fullSentence}</span><br/>
            ${item.acceptedAnswers && item.acceptedAnswers.length > 1 ? `• <strong>Các cách viết đúng khác:</strong> ${item.acceptedAnswers.join(' | ')}<br/>` : ''}
            • <strong>Giải thích:</strong> ${item.explanation || ''}
          </div>
        ` : ''}
      </div>
    `;
  }

  function renderPaper3(test) {
    const shortConvs = test.paper3?.shortConversations || [];
    const longConv = test.paper3?.longConversation || {};
    const talk = test.paper3?.talk || {};

    return `
      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">🎧 PAPER 3: LISTENING COMPREHENSION (Câu 51 – 70 • 20 điểm)</h3>
            <p style="font-size:13px; color:var(--text-secondary);">
              Bấm nút <strong>🔊 Nghe hội thoại</strong> để nghe phát âm chuẩn (AI Text-to-Speech) và chọn đáp án đúng.
            </p>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:12px; color:var(--text-secondary);">Tốc độ đọc:</span>
            ${[0.8, 1.0, 1.2].map(r => `
              <button class="btn-outline btn-sm ${state.ttsRate === r ? 'selected' : ''}" onclick="setTtsRate(${r})">${r}x</button>
            `).join('')}
            <button class="btn-outline btn-sm" onclick="stopSpeech()">⏹ Dừng đọc</button>
          </div>
        </div>
      </div>

      <div class="card">
        <h4 class="card-title">PART A: SHORT CONVERSATIONS (Câu 51 – 60 • 10 điểm)</h4>
      </div>
      ${shortConvs.map(q => {
        const scriptId = `script-${test.id}-${q.num}`;
        return `
          <div class="card" style="padding:12px;">
            <div class="tts-bar" style="margin-top:0;">
              <div style="display:flex; gap:8px; align-items:center;">
                <button class="btn-primary btn-sm" onclick="speakText(\`${(q.script || '').replace(/`/g, "'")}\`)">
                  🔊 Nghe câu ${q.num} (2 lượt)
                </button>
                <button class="btn-outline btn-sm" onclick="toggleElement('${scriptId}')">📜 Xem/Ẩn Transcript</button>
              </div>
            </div>
            <div id="${scriptId}" class="translation-box hidden" style="margin-bottom:10px;">
              <strong>Transcript hội thoại:</strong><br/>${q.script || ''}
            </div>
            ${renderMcqCard(test.id, q, `${test.title} Listening`)}
          </div>
        `;
      }).join('')}

      <!-- PART B: LONG CONVERSATION -->
      <div class="card" style="margin-top:18px;">
        <div class="card-header">
          <h4 class="card-title">PART B: LONGER CONVERSATION (Câu 61 – 65 • 5 điểm)</h4>
          <div style="display:flex; gap:8px;">
            <button class="btn-primary btn-sm" onclick="speakText(\`${(longConv.script || '').replace(/`/g, "'")}\`)">🔊 Nghe bài phỏng vấn</button>
            <button class="btn-outline btn-sm" onclick="stopSpeech()">⏹ Dừng</button>
            <button class="btn-outline btn-sm" onclick="toggleElement('long-script-${test.id}')">📜 Xem/Ẩn Transcript</button>
          </div>
        </div>
        <p style="font-size:13.5px; font-weight:600; margin-bottom:10px;">${longConv.intro || ''}</p>
        <div id="long-script-${test.id}" class="translation-box hidden" style="margin-bottom:12px;">
          <strong>Transcript bài nghe (Câu 61–65):</strong><br/>${longConv.script || ''}
        </div>
        ${(longConv.questions || []).map(q => renderMcqCard(test.id, q, `${test.title} Listening B`)).join('')}
      </div>

      <!-- PART C: TALK -->
      <div class="card" style="margin-top:18px;">
        <div class="card-header">
          <h4 class="card-title">PART C: SHORT TALK (Câu 66 – 70 • 5 điểm)</h4>
          <div style="display:flex; gap:8px;">
            <button class="btn-primary btn-sm" onclick="speakText(\`${(talk.script || '').replace(/`/g, "'")}\`)">🔊 Nghe bài nói</button>
            <button class="btn-outline btn-sm" onclick="stopSpeech()">⏹ Dừng</button>
            <button class="btn-outline btn-sm" onclick="toggleElement('talk-script-${test.id}')">📜 Xem/Ẩn Transcript</button>
          </div>
        </div>
        <p style="font-size:13.5px; font-weight:600; margin-bottom:10px;">${talk.intro || ''}</p>
        <div id="talk-script-${test.id}" class="translation-box hidden" style="margin-bottom:12px;">
          <strong>Transcript bài nghe (Câu 66–70):</strong><br/>${talk.script || ''}
        </div>
        ${(talk.questions || []).map(q => renderMcqCard(test.id, q, `${test.title} Listening C`)).join('')}
      </div>
    `;
  }

  function renderPaper4(test) {
    const topics = getSpeakingTopics();
    const introTopic = topics.find(t => t.id === 'speaking-intro') || topics[0];
    const matchedTopic = topics.find(t => t.title.toLowerCase().includes((test.speakingTopic || '').toLowerCase())) || topics[1];
    const currentSelfScore = state.speakingSelfScore[test.id] !== undefined ? state.speakingSelfScore[test.id] : 14;

    return `
      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">🗣️ PAPER 4: SPEAKING (20 điểm • ~15 phút)</h3>
            <p style="font-size:13px; color:var(--text-secondary);">
              A. Self-introduction (5 điểm) • B. Guided conversation: <strong>${test.speakingTopic}</strong> (15 điểm)
            </p>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <label style="font-size:13px; font-weight:600;">Tự đánh giá điểm Speaking:</label>
            <input type="number" min="0" max="20" value="${currentSelfScore}" class="text-input" style="width:75px; min-width:unset; padding:6px 10px;" onchange="setSpeakingSelfScore('${test.id}', this.value)" />
            <span style="font-size:13px;">/ 20đ</span>
          </div>
        </div>
      </div>

      ${introTopic ? renderSpeakingTopicDetail(introTopic) : ''}
      ${matchedTopic ? renderSpeakingTopicDetail(matchedTopic) : ''}
    `;
  }

  // ==================== WRITING PRACTICE (20 TOPICS) VIEW ====================

  function renderWritingView() {
    const sets = getWritingSets();
    if (!sets.length) return `<div class="card">Đang tải dữ liệu 20 chuyên đề viết lại câu...</div>`;
    const currentSet = sets.find(s => s.id === state.selectedWritingId) || sets[0];

    return `
      <div class="card">
        <h2 style="font-size:19px; font-weight:800;">✍️ 20 Chuyên Đề Viết Lại Câu (Sentence Transformation - Trang 71–79)</h2>
        <p style="font-size:13px; color:var(--text-secondary);">
          Luyện tập toàn bộ 22 bài thực hành (Practice 1 – 20C) theo đúng cấu trúc Paper 2 - Part C.
        </p>
        <div class="pill-bar" style="margin-top:12px; margin-bottom:0;">
          ${sets.map(s => `
            <button class="pill-btn ${s.id === currentSet.id ? 'active' : ''}" onclick="selectWritingSet('${s.id}')">
              ${s.title.split(':')[0]}
            </button>
          `).join('')}
        </div>
      </div>

      <div class="card" style="border-left: 4px solid var(--accent);">
        <h3 class="card-title">${currentSet.title}</h3>
        <div class="explanation-box" style="margin-top:8px;">
          📐 <strong>Công thức ngữ pháp:</strong><br/>
          <code style="font-size:14px; color:var(--accent); font-weight:700;">${currentSet.formula || ''}</code><br/>
          <span style="font-size:13px; color:var(--text-secondary);">${currentSet.example || ''}</span>
        </div>
      </div>

      ${(currentSet.questions || []).map(item => renderTransformationCard(currentSet.id, item, currentSet.title)).join('')}
    `;
  }

  // ==================== GRAMMAR PRACTICE (3 SETS) VIEW ====================

  function renderGrammarView() {
    const sets = getGrammarSets();
    if (!sets.length) return `<div class="card">Đang tải dữ liệu Ngữ pháp chuyên sâu...</div>`;
    const currentSet = sets.find(s => s.id === state.selectedGrammarId) || sets[0];

    return `
      <div class="card">
        <h2 style="font-size:19px; font-weight:800;">📚 Chuyên Đề Ngữ Pháp Tuyển Sinh Sau Đại Học (Trang 65–70)</h2>
        <p style="font-size:13px; color:var(--text-secondary);">
          94 câu trắc nghiệm ngữ pháp trọng tâm của ĐH Khoa học Tự nhiên - ĐHQG TP.HCM.
        </p>
        <div class="pill-bar" style="margin-top:12px; margin-bottom:0;">
          ${sets.map(s => `
            <button class="pill-btn ${s.id === currentSet.id ? 'active' : ''}" onclick="selectGrammarSet('${s.id}')">
              ${s.title}
            </button>
          `).join('')}
        </div>
      </div>

      <div class="card">
        <h3 class="card-title">${currentSet.title}</h3>
        <p style="font-size:13px; color:var(--text-secondary);">${currentSet.description || ''}</p>
      </div>

      ${(currentSet.questions || []).map(q => renderMcqCard(currentSet.id, q, currentSet.title)).join('')}
    `;
  }

  // ==================== SPEAKING VIEW ====================

  function renderSpeakingView() {
    const topics = getSpeakingTopics();
    if (!topics.length) return `<div class="card">Đang tải dữ liệu Speaking...</div>`;
    const currentTopic = topics.find(t => t.id === state.selectedSpeakingId) || topics[0];

    return `
      <div class="card">
        <h2 style="font-size:19px; font-weight:800;">🗣️ Luyện Nói Paper 4: Self-Introduction & 10 Chủ Đề Đề Cương (20 điểm)</h2>
        <p style="font-size:13px; color:var(--text-secondary);">
          Thời gian thi thật: 5–7 phút chuẩn bị + ~10 phút trình bày & trả lời câu hỏi của giám khảo.
        </p>
        <div class="pill-bar" style="margin-top:12px; margin-bottom:0;">
          ${topics.map(t => `
            <button class="pill-btn ${t.id === currentTopic.id ? 'active' : ''}" onclick="selectSpeakingTopic('${t.id}')">
              ${t.title}
            </button>
          `).join('')}
        </div>
      </div>

      ${renderSpeakingTopicDetail(currentTopic)}
    `;
  }

  function renderSpeakingTopicDetail(topic) {
    return `
      <div class="card">
        <div class="card-header">
          <div>
            <span class="chip">${topic.part || 'Speaking'} • ${topic.testRef || ''}</span>
            <h3 class="card-title" style="font-size:18px; margin-top:6px;">${topic.title}</h3>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn-primary btn-sm" onclick="speakText(\`${(topic.sampleSpeech || '').replace(/`/g, "'")}\`)">
              🔊 Nghe bài nói mẫu
            </button>
            <button class="btn-outline btn-sm" onclick="stopSpeech()">⏹ Dừng</button>
          </div>
        </div>

        <div class="grid-2" style="margin-top:10px;">
          <!-- Outline & Tips -->
          <div class="question-card" style="margin-bottom:0;">
            <h4 style="font-size:14px; font-weight:700; margin-bottom:8px; color:var(--accent);">📌 Dàn ý trả lời (Outline 3 phần)</h4>
            <ul style="padding-left:18px; font-size:13.5px; margin-bottom:12px;">
              ${(topic.outline || []).map(o => `<li style="margin-bottom:4px;">${o}</li>`).join('')}
            </ul>
            <h4 style="font-size:14px; font-weight:700; margin-bottom:6px; color:var(--success);">💡 Mẹo ghi điểm với Giám khảo</h4>
            <ul style="padding-left:18px; font-size:13px; color:var(--text-secondary);">
              ${(topic.tips || []).map(tip => `<li style="margin-bottom:4px;">${tip}</li>`).join('')}
            </ul>
          </div>

          <!-- Key Vocabulary -->
          <div class="question-card" style="margin-bottom:0;">
            <h4 style="font-size:14px; font-weight:700; margin-bottom:8px; color:var(--accent);">💎 Từ vựng & Cụm từ ăn điểm</h4>
            <div style="display:flex; flex-direction:column; gap:8px;">
              ${(topic.vocabulary || []).map(v => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 10px; background:var(--bg-elevated); border-radius:8px;">
                  <div>
                    <strong>${v.word}</strong> <span style="font-size:12px; color:var(--text-secondary);">${v.phonetic || ''}</span>
                    <div style="font-size:12.5px; color:var(--text-secondary);">${v.meaning}</div>
                  </div>
                  <button class="icon-btn btn-sm" onclick="speakText('${v.word.replace(/'/g, "\\'")}')">🔊</button>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- Sample Speech -->
        <div style="margin-top:14px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <h4 style="font-size:15px; font-weight:700;">🎤 Bài nói mẫu hoàn chỉnh (Sample Answer)</h4>
            <button class="btn-outline btn-sm" onclick="toggleElement('spk-trans-${topic.id}')">🇻🇳 Xem/Ẩn Dịch nghĩa</button>
          </div>
          <div class="passage-box" style="margin-bottom:8px;">${topic.sampleSpeech || ''}</div>
          <div id="spk-trans-${topic.id}" class="translation-box">
            <strong>Bản dịch tiếng Việt:</strong><br/>${topic.sampleTranslation || ''}
          </div>
        </div>

        <!-- Follow-up Questions -->
        <div style="margin-top:16px;">
          <h4 style="font-size:15px; font-weight:700; margin-bottom:10px;">❓ Câu hỏi phụ Giám khảo thường hỏi (Guided Conversation Q&A)</h4>
          ${(topic.followUpQuestions || []).map((fq, i) => `
            <div class="question-card">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                <strong style="color:var(--accent);">Q${i + 1}: ${fq.q}</strong>
                <button class="icon-btn btn-sm" onclick="speakText(\`${(fq.q + '. ' + fq.a).replace(/`/g, "'")}\`)">🔊 Nghe Q&A</button>
              </div>
              <p style="font-size:14px; margin-top:6px;"><strong>Sample Answer:</strong> ${fq.a}</p>
              <p style="font-size:13px; color:var(--text-secondary); margin-top:4px;"><em>Dịch: ${fq.vi || ''}</em></p>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // ==================== ACTIONS & HANDLERS ====================

  window.switchTab = function (tab) {
    state.activeTab = tab;
    saveState();
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  window.selectTest = function (testId) {
    state.selectedTestId = testId;
    saveState();
    render();
  };

  window.openTest = function (testId) {
    state.selectedTestId = testId;
    state.activeTab = 'tests';
    saveState();
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  window.selectPaper = function (paper) {
    state.selectedPaper = paper;
    saveState();
    render();
  };

  window.setExamMode = function (mode) {
    state.examMode = mode;
    if (mode !== 'mock') {
      stopMockTimer();
    }
    saveState();
    render();
  };

  window.selectWritingSet = function (id) {
    state.selectedWritingId = id;
    saveState();
    render();
  };

  window.selectGrammarSet = function (id) {
    state.selectedGrammarId = id;
    saveState();
    render();
  };

  window.selectSpeakingTopic = function (id) {
    state.selectedSpeakingId = id;
    saveState();
    render();
  };

  window.answerMcq = function (key, letter) {
    state.userAnswers[key] = letter;
    saveState();
    render();
  };

  window.saveWritingDraft = function (key, val) {
    state.userAnswers[key] = val;
    saveState();
  };

  window.checkWritingItem = function (prefixId, num) {
    const key = `${prefixId}-q-${num}`;
    const inputEl = document.getElementById(`input-${key}`);
    const val = inputEl ? inputEl.value : (state.userAnswers[key] || '');
    state.userAnswers[key] = val;

    // Find item in either tests or writing sets
    let item = null;
    const test = getTests().find(t => t.id === prefixId);
    if (test) {
      item = (test.paper2?.transformation || []).find(x => x.num === num);
    } else {
      const wSet = getWritingSets().find(s => s.id === prefixId);
      if (wSet) item = (wSet.questions || []).find(x => x.num === num);
    }

    if (item) {
      const isCorrect = checkTransformationAnswer(val, item);
      state.checkedWriting[key] = { isCorrect, userText: val };
    }
    saveState();
    render();
  };

  window.showWritingAnswer = function (key) {
    state.checkedWriting[key] = { isCorrect: false, userText: state.userAnswers[key] || '' };
    saveState();
    render();
  };

  window.setSpeakingSelfScore = function (testId, val) {
    const num = Math.max(0, Math.min(20, Number(val) || 0));
    state.speakingSelfScore[testId] = num;
    saveState();
    render();
  };

  window.toggleElement = function (id) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden');
  };

  window.resetAllProgress = function () {
    if (!confirm('Bạn có chắc muốn xóa toàn bộ câu trả lời để làm lại từ đầu không? (Các câu đã lưu ⭐ vẫn được giữ nguyên)')) return;
    state.userAnswers = {};
    state.checkedWriting = {};
    saveState();
    render();
  };

  // ==================== MOCK EXAM TIMER ====================

  window.startMockExam = function (testId) {
    state.selectedTestId = testId;
    state.examMode = 'mock';
    state.activeTab = 'tests';
    examSecondsRemaining = 110 * 60; // 90m Reading/Writing + 20m Listening
    const bar = document.getElementById('examTimerBar');
    if (bar) bar.classList.remove('hidden');
    if (examTimerInterval) clearInterval(examTimerInterval);
    examTimerInterval = setInterval(() => {
      examSecondsRemaining--;
      updateTimerUI();
      if (examSecondsRemaining <= 0) {
        stopMockTimer();
        submitMockExam();
      }
    }, 1000);
    updateTimerUI();
    saveState();
    render();
  };

  function stopMockTimer() {
    if (examTimerInterval) {
      clearInterval(examTimerInterval);
      examTimerInterval = null;
    }
    const bar = document.getElementById('examTimerBar');
    if (bar) bar.classList.add('hidden');
  }

  function updateTimerUI() {
    const clock = document.getElementById('examClock');
    if (clock) {
      const m = Math.floor(examSecondsRemaining / 60);
      const s = examSecondsRemaining % 60;
      clock.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    const test = getTests().find(t => t.id === state.selectedTestId);
    const prog = document.getElementById('examAnsweredCount');
    if (test && prog) {
      let answered = 0;
      for (let i = 1; i <= 70; i++) {
        if (state.userAnswers[`${test.id}-q-${i}`]) answered++;
      }
      prog.textContent = `${answered}/70 câu`;
    }
  }

  function submitMockExam() {
    const test = getTests().find(t => t.id === state.selectedTestId);
    if (!test) return;
    // Grade all writing items automatically
    (test.paper2?.transformation || []).forEach(tr => {
      const key = `${test.id}-q-${tr.num}`;
      const val = state.userAnswers[key] || '';
      state.checkedWriting[key] = {
        isCorrect: checkTransformationAnswer(val, tr),
        userText: val
      };
    });
    state.examMode = 'study';
    stopMockTimer();
    const sc = calculateTestScore(test);
    state.mockHistory.unshift({
      testId: test.id,
      title: test.title,
      date: new Date().toLocaleString('vi-VN'),
      ...sc
    });
    saveState();
    render();
    showModal(
      `🎉 Kết quả Thi thử: ${test.title}`,
      `
        <div style="text-align:center; padding:12px 0;">
          <div style="font-size:42px; font-weight:800; color:${sc.total >= 50 ? 'var(--success)' : 'var(--danger)'};">
            ${sc.total} / 100 điểm
          </div>
          <span class="chip ${sc.total >= 50 ? 'chip-success' : 'chip-danger'}" style="font-size:14px; padding:6px 14px; margin-top:6px;">
            ${sc.total >= 50 ? '✅ ĐẠT YÊU CẦU TUYỂN SINH THẠC SĨ (≥ 50/100)' : '⚠️ CHƯA ĐẠT (Cần tối thiểu 50/100 điểm)'}
          </span>
        </div>
        <table class="structure-table" style="margin-top:14px;">
          <thead>
            <tr>
              <th>Phần thi</th>
              <th>Số câu đúng</th>
              <th>Điểm quy đổi</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Paper 1: Vocabulary & Reading</td>
              <td>${sc.p1Correct} / ${sc.p1Total} câu</td>
              <td><strong>${sc.p1} / 20 đ</strong></td>
            </tr>
            <tr>
              <td>Paper 2: Grammar, Cloze & Writing</td>
              <td>${sc.p2Correct} / ${sc.p2Total} câu</td>
              <td><strong>${sc.p2} / 40 đ</strong></td>
            </tr>
            <tr>
              <td>Paper 3: Listening Comprehension</td>
              <td>${sc.p3Correct} / ${sc.p3Total} câu</td>
              <td><strong>${sc.p3} / 20 đ</strong></td>
            </tr>
            <tr>
              <td>Paper 4: Speaking (${test.speakingTopic})</td>
              <td>Tự đánh giá</td>
              <td><strong>${sc.p4} / 20 đ</strong></td>
            </tr>
          </tbody>
        </table>
        <div class="explanation-box" style="margin-top:14px;">
          💡 App đã chuyển sang <strong>Chế độ Học (Giải chi tiết)</strong> để bạn xem lại toàn bộ đáp án đúng và lời giải tiếng Việt cho từng câu trong đề!
        </div>
      `
    );
  }

  function showModal(title, html) {
    const modal = document.getElementById('appModal');
    const titleEl = document.getElementById('modalTitle');
    const bodyEl = document.getElementById('modalBody');
    if (titleEl) titleEl.textContent = title;
    if (bodyEl) bodyEl.innerHTML = html;
    if (modal) modal.classList.remove('hidden');
  }

  function showBookmarksModal() {
    const items = Object.values(state.bookmarks || {});
    if (!items.length) {
      showModal('⭐ Sổ tay câu khó / Đã lưu', `<p style="color:var(--text-secondary);">Bạn chưa lưu câu hỏi nào. Hãy bấm nút <strong>☆ Lưu</strong> ở bất kỳ câu hỏi nào để đưa vào sổ tay ôn tập trước ngày thi!</p>`);
      return;
    }
    showModal(
      `⭐ Sổ tay câu đã lưu (${items.length} câu)`,
      items.map(item => `
        <div class="question-card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <span class="chip">${item.title}</span>
            <button class="btn-outline btn-sm" onclick="toggleBookmark('${item.key}'); showBookmarksModal();">Bỏ lưu</button>
          </div>
          <div style="font-weight:600; margin-bottom:6px;">${item.question}</div>
          <div class="explanation-box">
            <strong>Đáp án: ${item.answer}</strong> — ${item.explanation || ''}
          </div>
        </div>
      `).join('')
    );
  }
  window.showBookmarksModal = showBookmarksModal;

  function render() {
    updateHeaderBadges();
    const container = document.getElementById('mainContent');
    if (!container) return;

    document.querySelectorAll('.bottom-nav .nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === state.activeTab);
    });

    if (state.activeTab === 'dashboard') {
      container.innerHTML = renderDashboard();
    } else if (state.activeTab === 'vocab') {
      container.innerHTML = renderVocabView();
    } else if (state.activeTab === 'tests') {
      container.innerHTML = renderTestsView();
    } else if (state.activeTab === 'writing') {
      container.innerHTML = renderWritingView();
    } else if (state.activeTab === 'grammar') {
      container.innerHTML = renderGrammarView();
    } else if (state.activeTab === 'speaking') {
      container.innerHTML = renderSpeakingView();
    }
  }

  // Initialize Event Listeners
  window.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.bottom-nav .nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        window.switchTab(btn.dataset.tab);
      });
    });

    const btnTheme = document.getElementById('btnTheme');
    if (btnTheme) {
      btnTheme.addEventListener('click', () => {
        state.theme = state.theme === 'light' ? 'dark' : 'light';
        saveState();
        render();
      });
    }

    const btnViewMode = document.getElementById('btnViewMode');
    if (btnViewMode) {
      btnViewMode.addEventListener('click', () => {
        state.mobileFrame = !state.mobileFrame;
        saveState();
        render();
      });
    }

    const btnBookmarks = document.getElementById('btnBookmarks');
    if (btnBookmarks) {
      btnBookmarks.addEventListener('click', showBookmarksModal);
    }

    const btnCloseModal = document.getElementById('btnCloseModal');
    if (btnCloseModal) {
      btnCloseModal.addEventListener('click', () => {
        document.getElementById('appModal')?.classList.add('hidden');
      });
    }

    const btnSubmitExam = document.getElementById('btnSubmitExam');
    if (btnSubmitExam) {
      btnSubmitExam.addEventListener('click', submitMockExam);
    }

    const btnExitExam = document.getElementById('btnExitExam');
    if (btnExitExam) {
      btnExitExam.addEventListener('click', () => {
        state.examMode = 'study';
        stopMockTimer();
        saveState();
        render();
      });
    }

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    render();
  });
})();
