/**
 * exam-runner.js — Điều phối phòng thi trực tuyến của học sinh
 * NoadD.Vo LMS & Exam Studio 3.0
 */

const ExamRunner = (() => {
  let examData = null;
  let userAnswers = {}; // { qId: answer }
  let session = null;
  let isMobilePaletteOpen = false;

  // ============================================================
  // KHỞI TẠO PHÒNG THI
  // ============================================================
  const init = () => {
    // 1. Kiểm tra phiên đăng nhập
    session = Storage.StudentSession.get();
    if (!session || !session.examCode) {
      alert('Không tìm thấy thông tin phòng thi. Vui lòng vào lại từ trang chủ!');
      window.location.href = 'index.html';
      return;
    }

    // 2. Lấy dữ liệu đề thi
    examData = Storage.Exams.getByCode(session.examCode);
    if (!examData) {
      alert(`Không tìm thấy đề thi với mã phòng [${session.examCode}]. Vui lòng kiểm tra lại!`);
      window.location.href = 'index.html';
      return;
    }

    // 3. Khôi phục bài làm dang dở (nếu học sinh lỡ tải lại trang)
    const savedDraft = Storage.StudentSession.getDraft(session.examCode, session.studentId);
    if (savedDraft) {
      userAnswers = savedDraft;
    }

    // 4. Cập nhật thông tin giao diện
    const sNameEl = document.getElementById('studentNameBadge');
    if (sNameEl) sNameEl.textContent = session.studentName || 'Học sinh';

    const sClassEl = document.getElementById('studentClassBadge');
    if (sClassEl) sClassEl.textContent = session.studentClass ? `Lớp: ${session.studentClass}` : '';

    const titleEl = document.getElementById('examTitleBadge');
    if (titleEl) titleEl.textContent = examData.config?.title || examData.meta?.title || 'BÀI THI TRỰC TUYẾN';

    // 5. Render đề thi
    renderExamPaper();

    // 6. Render palette câu hỏi (cả Desktop và Mobile)
    renderPalette();

    // 7. Khởi động bảo mật phòng thi (Chống chuột phải & chống chụp màn hình, KHÔNG khóa bài sau 5 lần)
    AntiCheat.start();

    // 8. Bắt đầu đếm ngược thời gian
    const durationMinutes = examData.config?.duration || 45;
    ExamTimer.start(
      durationMinutes,
      (remaining, total, percent) => {
        const timerEl = document.getElementById('timerDisplay');
        if (timerEl) timerEl.textContent = ExamTimer.format(remaining);
        
        const state = ExamTimer.getState(percent);
        const pill = document.getElementById('timerPill');
        if (pill) {
          pill.classList.remove('warning', 'danger');
          if (state !== 'normal') pill.classList.add(state);
        }
      },
      () => {
        alert('Đã hết thời gian làm bài! Hệ thống đang tự động nộp bài của bạn.');
        submitExam(true);
      }
    );
  };

  // ============================================================
  // RENDER ĐỀ THI
  // ============================================================
  const renderExamPaper = () => {
    const container = document.getElementById('examPaperContainer');
    if (!container) return;

    const renderer = new TexRenderer();
    container.innerHTML = renderer.renderExam(examData, {
      mode: 'exam',
      showAnswers: false,
      showSolutions: false,
      paperStyle: 'grid-oly',
      imageBasePath: 'images'
    });

    // Thêm hình mờ bảo mật chống chụp ảnh camera vật lý
    addWatermark(container);

    // Render toàn bộ công thức KaTeX
    KatexRenderer.renderAll(container);

    // Gắn sự kiện chọn đáp án
    bindAnswerEvents();

    // Khôi phục các đáp án đã chọn (nếu có bản nháp)
    restoreDraftAnswers();
  };

  /**
   * Thêm watermark mờ chứa tên học sinh & mã đề
   */
  const addWatermark = (container) => {
    const wmText = `${session.studentName || 'Học sinh'} • ${session.studentClass || ''} • ${session.examCode || ''}`;
    const wmWrap = document.createElement('div');
    wmWrap.className = 'exam-watermark';
    let items = '';
    for (let i = 0; i < 20; i++) {
      items += `<span class="exam-watermark-item">${wmText}</span>`;
    }
    wmWrap.innerHTML = items;
    container.prepend(wmWrap);
  };

  // ============================================================
  // RENDER BẢNG ĐIỀU HƯỚNG CÂU HỎI (PALETTE)
  // ============================================================
  const renderPalette = () => {
    if (!examData || !examData.questions) return;

    const gridDesktop = document.getElementById('paletteGrid');
    const gridMobile = document.getElementById('paletteGridMobile');

    const html = examData.questions.map((q, idx) => `
      <button class="palette-item" id="pal-btn-${q.id}" onclick="ExamRunner.scrollToQuestion('${q.id}')">
        ${idx + 1}
      </button>
    `).join('');

    const htmlMobile = examData.questions.map((q, idx) => `
      <button class="palette-item" id="mobile-pal-btn-${q.id}" onclick="ExamRunner.scrollToQuestion('${q.id}')">
        ${idx + 1}
      </button>
    `).join('');

    if (gridDesktop) gridDesktop.innerHTML = html;
    if (gridMobile) gridMobile.innerHTML = htmlMobile;

    updateProgress();
  };

  /**
   * Bật/tắt Drawer câu hỏi trên Mobile
   */
  const toggleMobilePalette = (forceState) => {
    const drawer = document.getElementById('mobilePaletteDrawer');
    if (!drawer) return;

    if (typeof forceState === 'boolean') {
      isMobilePaletteOpen = forceState;
    } else {
      isMobilePaletteOpen = !isMobilePaletteOpen;
    }

    if (isMobilePaletteOpen) {
      drawer.classList.remove('hidden');
    } else {
      drawer.classList.add('hidden');
    }
  };

  /**
   * Cuộn mượt tới câu hỏi tương ứng và highlight
   */
  const scrollToQuestion = (qId) => {
    const qEl = document.querySelector(`[data-question-id="${qId}"]`);
    if (qEl) {
      qEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Highlight nút tương ứng
      document.querySelectorAll('.palette-item').forEach(b => b.classList.remove('current'));
      const activeBtn = document.getElementById(`pal-btn-${qId}`);
      if (activeBtn) activeBtn.classList.add('current');
      const activeBtnMobile = document.getElementById(`mobile-pal-btn-${qId}`);
      if (activeBtnMobile) activeBtnMobile.classList.add('current');

      // Tự động đóng drawer nếu đang mở trên Mobile
      toggleMobilePalette(false);
    }
  };

  // ============================================================
  // XỬ LÝ LỰA CHỌN ĐÁP ÁN CỦA HỌC SINH
  // ============================================================
  const bindAnswerEvents = () => {
    // 1. Trắc nghiệm nhiều phương án (Phần I - Choice)
    document.querySelectorAll('.choice-item').forEach(el => {
      el.addEventListener('click', () => {
        const qBlock = el.closest('[data-question-id]');
        if (!qBlock) return;
        const qId = qBlock.getAttribute('data-question-id');
        const letter = el.getAttribute('data-letter');

        qBlock.querySelectorAll('.choice-item').forEach(c => c.classList.remove('selected'));
        el.classList.add('selected');

        const radio = el.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;

        userAnswers[qId] = letter;
        saveDraft();
        markPaletteAnswered(qId);
        updateProgress();
      });
    });

    // 2. Trắc nghiệm Đúng / Sai (Phần II - TrueFalse)
    document.querySelectorAll('.tf-input-group input[type="radio"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const qBlock = radio.closest('[data-question-id]');
        if (!qBlock) return;
        const qId = qBlock.getAttribute('data-question-id');
        const tfItem = radio.closest('.tf-item');
        const letter = tfItem ? tfItem.getAttribute('data-letter') : radio.name.split('_')[1];
        const val = radio.value === 'true';

        if (!userAnswers[qId] || typeof userAnswers[qId] !== 'object') userAnswers[qId] = {};
        userAnswers[qId][letter] = val;

        saveDraft();
        markPaletteAnswered(qId);
        updateProgress();
      });
    });

    // 3. Trả lời ngắn (Phần III - ShortAnswer)
    document.querySelectorAll('.short-answer-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const qBlock = input.closest('[data-question-id]');
        if (!qBlock) return;
        const qId = qBlock.getAttribute('data-question-id');
        userAnswers[qId] = e.target.value.trim();

        saveDraft();
        if (userAnswers[qId]) {
          markPaletteAnswered(qId);
        } else {
          unmarkPaletteAnswered(qId);
        }
        updateProgress();
      });
    });

    // 4. Tự luận (Phần IV - Essay)
    document.querySelectorAll('.essay-answer-textarea').forEach(textarea => {
      textarea.addEventListener('input', (e) => {
        const qBlock = textarea.closest('[data-question-id]');
        if (!qBlock) return;
        const qId = qBlock.getAttribute('data-question-id');
        const part = textarea.getAttribute('data-part') || 'a';

        if (!userAnswers[qId] || typeof userAnswers[qId] !== 'object') userAnswers[qId] = {};
        userAnswers[qId][part] = e.target.value.trim();

        saveDraft();
        if (Object.values(userAnswers[qId]).some(v => !!v)) {
          markPaletteAnswered(qId);
        } else {
          unmarkPaletteAnswered(qId);
        }
        updateProgress();
      });
    });
  };

  /**
   * Lưu bản nháp vào LocalStorage tránh mất bài khi F5
   */
  const saveDraft = () => {
    if (session && session.examCode) {
      Storage.StudentSession.saveDraft(session.examCode, session.studentId, userAnswers);
    }
  };

  /**
   * Khôi phục các đáp án đã chọn từ bản nháp
   */
  const restoreDraftAnswers = () => {
    if (!userAnswers || Object.keys(userAnswers).length === 0) return;

    for (const [qId, ans] of Object.entries(userAnswers)) {
      const qBlock = document.querySelector(`[data-question-id="${qId}"]`);
      if (!qBlock) continue;

      if (typeof ans === 'string') {
        // Choice
        const choice = qBlock.querySelector(`.choice-item[data-letter="${ans}"]`);
        if (choice) {
          choice.classList.add('selected');
          const radio = choice.querySelector('input[type="radio"]');
          if (radio) radio.checked = true;
          markPaletteAnswered(qId);
        }
        // Short Answer
        const input = qBlock.querySelector('.short-answer-input');
        if (input) {
          input.value = ans;
          markPaletteAnswered(qId);
        }
      } else if (typeof ans === 'object' && ans !== null) {
        // True/False
        for (const [letter, val] of Object.entries(ans)) {
          const radio = qBlock.querySelector(`input[name="tf_${qId}_${letter}"][value="${val}"]`);
          if (radio) radio.checked = true;
        }
        // Essay
        for (const [part, text] of Object.entries(ans)) {
          const ta = qBlock.querySelector(`.essay-answer-textarea[data-part="${part}"]`);
          if (ta) ta.value = text;
        }
        markPaletteAnswered(qId);
      }
    }
    updateProgress();
  };

  const markPaletteAnswered = (qId) => {
    const btn = document.getElementById(`pal-btn-${qId}`);
    if (btn) btn.classList.add('answered');
    const btnMobile = document.getElementById(`mobile-pal-btn-${qId}`);
    if (btnMobile) btnMobile.classList.add('answered');
  };

  const unmarkPaletteAnswered = (qId) => {
    const btn = document.getElementById(`pal-btn-${qId}`);
    if (btn) btn.classList.remove('answered');
    const btnMobile = document.getElementById(`mobile-pal-btn-${qId}`);
    if (btnMobile) btnMobile.classList.remove('answered');
  };

  const updateProgress = () => {
    const total = examData.questions?.length || 0;
    const answered = Object.keys(userAnswers).filter(k => {
      const v = userAnswers[k];
      if (typeof v === 'object' && v !== null) return Object.values(v).some(x => !!x || x === true || x === false);
      return !!v;
    }).length;

    const progText = document.getElementById('progressText');
    if (progText) progText.textContent = `Đã làm: ${answered}/${total}`;

    const mProgText = document.getElementById('mobileProgressText');
    if (mProgText) mProgText.textContent = `Đã làm: ${answered}/${total} câu`;

    const mFloat = document.getElementById('mobileFloatingProgress');
    if (mFloat) mFloat.textContent = `${answered}/${total} câu`;
  };

  // ============================================================
  // NỘP BÀI THI
  // ============================================================
  const submitExam = (isForced = false) => {
    if (!isForced) {
      const answeredCount = Object.keys(userAnswers).length;
      const totalCount = examData.questions?.length || 0;
      if (!confirm(`Bạn đã làm ${answeredCount}/${totalCount} câu. Bạn có chắc chắn muốn nộp bài thi không?`)) {
        return;
      }
    }

    ExamTimer.stop();
    AntiCheat.stop();

    // Chấm điểm
    const result = Storage.Submissions.calculateScore(examData, userAnswers);

    const submissionData = {
      examCode: examData.examCode,
      studentName: session.studentName,
      studentClass: session.studentClass,
      studentId: session.studentId,
      score: result.totalScore,
      correctCount: result.correctCount,
      totalCount: result.totalCount,
      userAnswers: userAnswers,
      violations: AntiCheat.getViolations(),
      integrity: AntiCheat.getIntegrity(),
    };

    Storage.Submissions.save(submissionData);

    // Xóa bản nháp sau khi đã nộp thành công
    Storage.StudentSession.clearDraft(session.examCode, session.studentId);

    // Hiển thị kết quả
    showResultModal(submissionData);
  };

  const showResultModal = (data) => {
    const viewSection = document.getElementById('examViewSection');
    if (viewSection) viewSection.classList.add('hidden');

    const floatBtn = document.getElementById('mobilePaletteToggleBtn');
    if (floatBtn) floatBtn.classList.add('hidden');

    const resSection = document.getElementById('resultViewSection');
    if (resSection) resSection.classList.remove('hidden');

    const nameEl = document.getElementById('resStudentName');
    if (nameEl) nameEl.textContent = data.studentName;

    const scoreEl = document.getElementById('resScoreDisplay');
    if (scoreEl) scoreEl.textContent = data.score;

    const countEl = document.getElementById('resCorrectCount');
    if (countEl) countEl.textContent = `${data.correctCount}/${data.totalCount} câu trắc nghiệm`;

    const intEl = document.getElementById('resIntegrity');
    if (intEl) intEl.textContent = `${data.integrity}%`;
  };

  return {
    init,
    scrollToQuestion,
    toggleMobilePalette,
    submitExam,
  };
})();

if (typeof window !== 'undefined') {
  window.ExamRunner = ExamRunner;
}
