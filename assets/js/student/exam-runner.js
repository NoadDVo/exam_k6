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
  let activeExamCode = '123456';

  const init = () => {
    // 1. Kiểm tra phiên đăng nhập
    session = Storage.StudentSession.get();

    // Hỗ trợ lấy mã phòng thi từ URL query param (?code=123456)
    const urlParams = new URLSearchParams(window.location.search);
    const codeFromUrl = urlParams.get('code') ? urlParams.get('code').trim() : '';

    const activeCode = codeFromUrl || session?.examCode || '123456';
    activeExamCode = activeCode;

    // 2. Lấy dữ liệu đề thi
    examData = Storage.Exams.getByCode(activeCode);
    if (!examData) {
      alert(`Không tìm thấy đề thi với mã phòng [${activeCode}]. Vui lòng kiểm tra lại đường link hoặc liên hệ giáo viên!`);
      window.location.href = 'index.html';
      return;
    }

    // 3. Luôn hiển thị Modal Xác Nhận Vào Phòng Thi để học sinh xác nhận, kiểm tra hoặc đổi thí sinh
    showStudentEntryModal(activeCode);
  };

  /**
   * Hiển thị bảng đăng ký thông tin thí sinh trước khi bắt đầu
   */
  const showStudentEntryModal = (code, forceClear = false) => {
    activeExamCode = code || activeExamCode || '123456';
    const modal = document.getElementById('studentEntryModal');
    if (!modal) return;

    // Ẩn khu vực làm bài thi và bảng palette trong khi chờ học sinh nhập/xác nhận thông tin
    const viewSection = document.getElementById('examViewSection');
    if (viewSection) viewSection.classList.add('hidden');

    const floatBtn = document.getElementById('mobilePaletteToggleBtn');
    if (floatBtn) floatBtn.classList.add('hidden');

    const resultSection = document.getElementById('resultViewSection');
    if (resultSection) resultSection.classList.add('hidden');

    const codeBadge = document.getElementById('entryExamCodeBadge');
    if (codeBadge) codeBadge.textContent = activeExamCode;

    const titleEl = document.getElementById('entryExamTitle');
    if (titleEl) titleEl.textContent = examData.config?.title || examData.meta?.title || 'BÀI THI TRỰC TUYẾN';

    const subjEl = document.getElementById('entryExamSubjectGrade');
    if (subjEl) subjEl.textContent = `Môn: ${examData.config?.subject || examData.meta?.subject || 'Toán'} • ${examData.config?.grade || examData.meta?.grade || 'Lớp 6'}`;

    const durEl = document.getElementById('entryExamDuration');
    if (durEl) durEl.innerHTML = `<i data-lucide="clock" class="w-3.5 h-3.5 inline mr-1"></i>${examData.config?.duration || 45} phút`;

    const qCountEl = document.getElementById('entryExamTotalQuestions');
    if (qCountEl) qCountEl.innerHTML = `<i data-lucide="list" class="w-3.5 h-3.5 inline mr-1"></i>${examData.questions?.length || 0} câu`;

    // Cập nhật tiêu đề navbar
    const titleBadge = document.getElementById('examTitleBadge');
    if (titleBadge) titleBadge.textContent = examData.config?.title || examData.meta?.title || 'BÀI THI TRỰC TUYẾN';

    const nameInput = document.getElementById('entryStudentName');
    const classInput = document.getElementById('entryStudentClass');
    const resumeNotice = document.getElementById('entryResumeNotice');
    const resumeName = document.getElementById('entryResumeStudentName');
    const btnText = document.getElementById('entrySubmitBtnText');

    const prevSession = forceClear ? null : Storage.StudentSession.get();
    const hasExistingSession = prevSession && 
                               String(prevSession.examCode).trim() === String(activeExamCode).trim() && 
                               prevSession.studentName && 
                               prevSession.studentName.trim() !== '' && 
                               prevSession.studentName.trim().toLowerCase() !== 'học sinh';

    if (hasExistingSession) {
      if (nameInput) nameInput.value = prevSession.studentName;
      if (classInput) classInput.value = prevSession.studentClass || '';
      if (resumeNotice) resumeNotice.classList.remove('hidden');
      if (resumeName) resumeName.textContent = `${prevSession.studentName} (${prevSession.studentClass || 'Chưa rõ lớp'})`;
      if (btnText) btnText.textContent = 'Tiếp Tục Bài Làm';
    } else {
      if (forceClear || !prevSession) {
        if (nameInput) nameInput.value = '';
        if (classInput) classInput.value = '';
      }
      if (resumeNotice) resumeNotice.classList.add('hidden');
      if (btnText) btnText.textContent = 'Bắt Đầu Làm Bài';
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    setTimeout(() => {
      if (nameInput) {
        if (!nameInput.value) nameInput.focus();
        else nameInput.select();
      }
    }, 150);

    if (typeof lucide !== 'undefined') lucide.createIcons();
  };

  /**
   * Xóa thông tin thí sinh cũ trên form và giải phóng phiên thi để thí sinh mới bắt đầu
   */
  const clearStudentEntryForm = () => {
    const nameInput = document.getElementById('entryStudentName');
    const classInput = document.getElementById('entryStudentClass');
    const resumeNotice = document.getElementById('entryResumeNotice');
    const btnText = document.getElementById('entrySubmitBtnText');

    if (nameInput) nameInput.value = '';
    if (classInput) classInput.value = '';
    if (resumeNotice) resumeNotice.classList.add('hidden');
    if (btnText) btnText.textContent = 'Bắt Đầu Làm Bài';

    // Xóa session cũ trong storage
    Storage.StudentSession.clear();
    session = null;
    userAnswers = {};

    if (nameInput) nameInput.focus();
  };

  /**
   * Bắt đầu làm bài sau khi học sinh xác nhận thông tin ở Modal
   */
  const startExamFromEntry = () => {
    const nameInput = document.getElementById('entryStudentName');
    const classInput = document.getElementById('entryStudentClass');

    const name = nameInput ? nameInput.value.trim() : '';
    const cls = classInput ? classInput.value.trim() : '';

    if (!name) {
      alert('Vui lòng nhập Họ và tên thí sinh!');
      if (nameInput) nameInput.focus();
      return;
    }

    if (!cls) {
      alert('Vui lòng nhập Tên Lớp của bạn (ví dụ: 6A1)!');
      if (classInput) classInput.focus();
      return;
    }

    // Kiểm tra xem thí sinh có trùng với phiên trước không
    const prev = Storage.StudentSession.get();
    let sId;
    if (prev && prev.studentName === name && prev.studentClass === cls && prev.studentId) {
      sId = prev.studentId;
    } else {
      sId = `HS_${Date.now().toString().slice(-4)}`;
      // Nếu là thí sinh mới thì xóa câu trả lời nháp của thí sinh trước
      userAnswers = {};
    }

    // Lưu phiên thi học sinh với thông tin thực tế
    session = {
      examCode: examData.examCode,
      studentName: name,
      studentClass: cls,
      studentId: sId,
      startTime: (prev && prev.studentName === name) ? (prev.startTime || new Date().toISOString()) : new Date().toISOString()
    };
    Storage.StudentSession.save(session);

    // Ẩn modal nhập thông tin
    const modal = document.getElementById('studentEntryModal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }

    // Bắt đầu làm bài thi chính thức
    startExamRunning();
  };

  /**
   * Đổi thông tin thí sinh hoặc mở lại modal xác nhận
   */
  const changeStudentInfo = () => {
    if (confirm('Bạn có muốn đổi thông tin thí sinh hoặc vào lại từ đầu? Bài làm hiện tại của bạn sẽ được tạm dừng.')) {
      ExamTimer.stop();
      AntiCheat.stop();
      showStudentEntryModal(activeExamCode);
    }
  };

  /**
   * Thoát phòng thi và quay về trang chủ
   */
  const exitExam = () => {
    if (confirm('Bạn có chắc muốn thoát phòng thi? Thông tin phiên thi sẽ được xóa để sẵn sàng cho lần thi sau.')) {
      ExamTimer.stop();
      AntiCheat.stop();
      Storage.StudentSession.clear();
      window.location.href = 'index.html';
    }
  };

  /**
   * Cho phép thí sinh khác vào thi (từ màn hình kết quả)
   */
  const startNewStudent = () => {
    ExamTimer.stop();
    AntiCheat.stop();
    Storage.StudentSession.clear();
    session = null;
    userAnswers = {};
    showStudentEntryModal(activeExamCode, true);
  };

  /**
   * Khởi động quá trình làm bài thi (Render, Palette, Chống gian lận, Đếm ngược)
   */
  const startExamRunning = () => {
    // Hiện khu vực làm bài thi
    const viewSection = document.getElementById('examViewSection');
    if (viewSection) viewSection.classList.remove('hidden');

    const floatBtn = document.getElementById('mobilePaletteToggleBtn');
    if (floatBtn) floatBtn.classList.remove('hidden');

    // 1. Khôi phục bài làm dang dở (nếu học sinh lỡ tải lại trang)
    const savedDraft = Storage.StudentSession.getDraft(session.examCode, session.studentId);
    if (savedDraft) {
      userAnswers = savedDraft;
    }

    // 2. Cập nhật thông tin giao diện
    const sNameEl = document.getElementById('studentNameBadge');
    if (sNameEl) sNameEl.textContent = session.studentName || 'Học sinh';

    const sClassEl = document.getElementById('studentClassBadge');
    if (sClassEl) sClassEl.textContent = session.studentClass ? `Lớp: ${session.studentClass}` : '';

    const titleEl = document.getElementById('examTitleBadge');
    if (titleEl) titleEl.textContent = examData.config?.title || examData.meta?.title || 'BÀI THI TRỰC TUYẾN';

    // 3. Render đề thi
    renderExamPaper();

    // 4. Render palette câu hỏi (cả Desktop và Mobile)
    renderPalette();

    // 5. Khởi động bảo mật phòng thi (Chống chuột phải & chống chụp màn hình)
    AntiCheat.start();

    // 6. Bắt đầu đếm ngược thời gian
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

    if (typeof lucide !== 'undefined') lucide.createIcons();
  };

  // ============================================================
  // RENDER ĐỀ THI
  // ============================================================
  const renderExamPaper = () => {
    const container = document.getElementById('examPaperContainer');
    if (!container) return;

    const renderer = new TexRenderer();
    const cfg = examData.config || {};
    container.innerHTML = renderer.renderExam(examData, {
      mode: 'exam',
      showAnswers: false,
      showSolutions: false,
      fontClass: cfg.fontClass || examData.fontClass || 'font-itim',
      paperStyle: cfg.paperStyle || examData.paperStyle || 'grid-oly',
      paperColor: cfg.paperColor || examData.paperColor || '#FDFCF7',
      imageBasePath: 'images',
      images: examData.images || {}
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
        updateShortAnswerPreview(input);
      });
    });

    // 3.1 Nút trợ giúp công thức nhanh Toán học cho học sinh (Math Quick Toolbar)
    document.querySelectorAll('.math-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const wrap = btn.closest('.short-answer-input-wrap');
        if (!wrap) return;
        const input = wrap.querySelector('.short-answer-input');
        if (!input) return;

        const action = btn.getAttribute('data-action');
        if (action === 'clear') {
          input.value = '';
          input.focus();
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }

        const insertText = btn.getAttribute('data-insert') || '';
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? input.value.length;
        const currentVal = input.value;

        input.value = currentVal.substring(0, start) + insertText + currentVal.substring(end);
        const cursorOffset = parseInt(btn.getAttribute('data-cursor') || '0', 10);
        const newPos = start + insertText.length + cursorOffset;
        input.setSelectionRange(newPos, newPos);
        input.focus();
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });

    // 3.2 Nút xóa nhanh cho widget tùy chỉnh
    document.querySelectorAll('[data-action="clear-custom"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const wrap = btn.closest('.short-answer-input-wrap');
        if (!wrap) return;
        const qId = wrap.getAttribute('data-question-id');
        wrap.querySelectorAll('input').forEach(inp => inp.value = '');
        userAnswers[qId] = '';
        saveDraft();
        unmarkPaletteAnswered(qId);
        updateProgress();
        const previewBox = wrap.querySelector('.short-answer-live-preview');
        if (previewBox) {
          previewBox.querySelector('.preview-badge')?.classList.add('hidden');
          const content = previewBox.querySelector('.preview-content');
          if (content) content.innerHTML = '';
        }
      });
    });

    // 3.3 Ô nhập Phân số (tử số / mẫu số riêng biệt)
    document.querySelectorAll('.fraction-input').forEach(fInput => {
      fInput.addEventListener('input', () => {
        const wrap = fInput.closest('.fraction-widget-wrap');
        if (!wrap) return;
        const qId = wrap.getAttribute('data-question-id');
        const num = wrap.querySelector('.fraction-num')?.value.trim() || '';
        const den = wrap.querySelector('.fraction-den')?.value.trim() || '';
        const hidden = wrap.querySelector('.short-answer-input');

        let val = '';
        if (num || den) {
          val = `${num}/${den}`;
        }
        if (hidden) hidden.value = val;
        userAnswers[qId] = val;

        saveDraft();
        if (num && den) {
          markPaletteAnswered(qId);
        } else {
          unmarkPaletteAnswered(qId);
        }
        updateProgress();
        updateWidgetPreview(wrap, 'fraction', { num, den });
      });

      fInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === 'ArrowDown') {
          if (fInput.classList.contains('fraction-num')) {
            e.preventDefault();
            const den = fInput.closest('.fraction-widget-wrap')?.querySelector('.fraction-den');
            if (den) den.focus();
          }
        } else if (e.key === 'ArrowUp') {
          if (fInput.classList.contains('fraction-den')) {
            e.preventDefault();
            const num = fInput.closest('.fraction-widget-wrap')?.querySelector('.fraction-num');
            if (num) num.focus();
          }
        }
      });
    });

    // 3.4 Ô nhập Lũy thừa (cơ số / số mũ riêng biệt)
    document.querySelectorAll('.power-input').forEach(pInput => {
      pInput.addEventListener('input', () => {
        const wrap = pInput.closest('.power-widget-wrap');
        if (!wrap) return;
        const qId = wrap.getAttribute('data-question-id');
        const inputType = wrap.getAttribute('data-input-type');
        const hidden = wrap.querySelector('.short-answer-input');

        let val = '';
        if (inputType === 'power_product') {
          const b1 = wrap.querySelector('.power-b1')?.value.trim() || '';
          const e1 = wrap.querySelector('.power-e1')?.value.trim() || '';
          const b2 = wrap.querySelector('.power-b2')?.value.trim() || '';
          const e2 = wrap.querySelector('.power-e2')?.value.trim() || '';
          if (b1 || e1 || b2 || e2) {
            val = `${b1}^${e1} \\cdot ${b2}^${e2}`;
          }
          if (hidden) hidden.value = val;
          userAnswers[qId] = val;
          if (b1 && e1 && b2 && e2) markPaletteAnswered(qId);
          else unmarkPaletteAnswered(qId);
          updateWidgetPreview(wrap, 'power_product', { b1, e1, b2, e2 });
        } else if (inputType === 'power_single') {
          const b1 = wrap.querySelector('.power-b1')?.value.trim() || '';
          const e1 = wrap.querySelector('.power-e1')?.value.trim() || '';
          if (b1 || e1) {
            val = `${b1}^${e1}`;
          }
          if (hidden) hidden.value = val;
          userAnswers[qId] = val;
          if (b1 && e1) markPaletteAnswered(qId);
          else unmarkPaletteAnswered(qId);
          updateWidgetPreview(wrap, 'power_single', { b1, e1 });
        }

        saveDraft();
        updateProgress();
      });

      pInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === 'ArrowRight') {
          const wrap = pInput.closest('.power-widget-wrap');
          if (!wrap) return;
          const inputs = Array.from(wrap.querySelectorAll('.power-input'));
          const idx = inputs.indexOf(pInput);
          if (idx !== -1 && idx < inputs.length - 1) {
            e.preventDefault();
            inputs[idx + 1].focus();
          }
        } else if (e.key === 'ArrowLeft') {
          const wrap = pInput.closest('.power-widget-wrap');
          if (!wrap) return;
          const inputs = Array.from(wrap.querySelectorAll('.power-input'));
          const idx = inputs.indexOf(pInput);
          if (idx > 0) {
            e.preventDefault();
            inputs[idx - 1].focus();
          }
        }
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
        // Short Answer (Hỗ trợ khôi phục cả ô nhập chuẩn và widget tùy chỉnh)
        const wrap = qBlock.querySelector('.short-answer-input-wrap');
        const input = qBlock.querySelector('.short-answer-input');
        if (wrap) {
          const inputType = wrap.getAttribute('data-input-type');
          if (inputType === 'fraction') {
            const parts = String(ans).split('/');
            const numInp = wrap.querySelector('.fraction-num');
            const denInp = wrap.querySelector('.fraction-den');
            if (numInp) numInp.value = parts[0] || '';
            if (denInp) denInp.value = parts[1] || '';
            if (input) input.value = ans;
            updateWidgetPreview(wrap, 'fraction', { num: parts[0], den: parts[1] });
          } else if (inputType === 'power_product') {
            const m = String(ans).match(/^(\d+)\^(\d+)\s*(?:\\cdot|\\times|\*|·)\s*(\d+)\^(\d+)$/);
            if (m) {
              const b1 = wrap.querySelector('.power-b1');
              const e1 = wrap.querySelector('.power-e1');
              const b2 = wrap.querySelector('.power-b2');
              const e2 = wrap.querySelector('.power-e2');
              if (b1) b1.value = m[1];
              if (e1) e1.value = m[2];
              if (b2) b2.value = m[3];
              if (e2) e2.value = m[4];
              updateWidgetPreview(wrap, 'power_product', { b1: m[1], e1: m[2], b2: m[3], e2: m[4] });
            }
            if (input) input.value = ans;
          } else if (inputType === 'power_single') {
            const m = String(ans).match(/^(\d+)\^(\d+)$/);
            if (m) {
              const b1 = wrap.querySelector('.power-b1');
              const e1 = wrap.querySelector('.power-e1');
              if (b1) b1.value = m[1];
              if (e1) e1.value = m[2];
              updateWidgetPreview(wrap, 'power_single', { b1: m[1], e1: m[2] });
            }
            if (input) input.value = ans;
          } else if (inputType === 'unit_number') {
            if (input) {
              input.value = ans;
              const unit = wrap.getAttribute('data-unit') || '';
              updateWidgetPreview(wrap, 'unit_number', { val: ans, unit });
            }
          } else {
            if (input) {
              input.value = ans;
              updateShortAnswerPreview(input);
            }
          }
          if (ans) markPaletteAnswered(qId);
        } else if (input) {
          input.value = ans;
          markPaletteAnswered(qId);
          updateShortAnswerPreview(input);
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

  /**
   * Cập nhật xem trước công thức KaTeX cho widget chuyên biệt (phân số, lũy thừa, đơn vị)
   */
  const updateWidgetPreview = (wrap, type, data) => {
    if (!wrap) return;
    const previewBox = wrap.querySelector('.short-answer-live-preview');
    if (!previewBox) return;
    const badge = previewBox.querySelector('.preview-badge');
    const content = previewBox.querySelector('.preview-content');
    if (!content) return;

    let latex = '';
    if (type === 'fraction') {
      if (!data.num && !data.den) {
        if (badge) badge.classList.add('hidden');
        content.innerHTML = '';
        return;
      }
      latex = `\\dfrac{${data.num || '?'}}{${data.den || '?'}}`;
    } else if (type === 'power_product') {
      if (!data.b1 && !data.e1 && !data.b2 && !data.e2) {
        if (badge) badge.classList.add('hidden');
        content.innerHTML = '';
        return;
      }
      latex = `{${data.b1 || '?'}}^{${data.e1 || '?'}} \\cdot {${data.b2 || '?'}}^{${data.e2 || '?'}}`;
    } else if (type === 'power_single') {
      if (!data.b1 && !data.e1) {
        if (badge) badge.classList.add('hidden');
        content.innerHTML = '';
        return;
      }
      latex = `{${data.b1 || '?'}}^{${data.e1 || '?'}}`;
    } else if (type === 'unit_number') {
      if (!data.val) {
        if (badge) badge.classList.add('hidden');
        content.innerHTML = '';
        return;
      }
      latex = `${data.val}\\text{ ${data.unit}}`;
    }

    if (badge) badge.classList.remove('hidden');
    if (typeof katex !== 'undefined' && latex) {
      try {
        content.innerHTML = katex.renderToString(latex, { throwOnError: false });
        return;
      } catch (err) {}
    }
    content.textContent = latex;
  };

  /**
   * Cập nhật khung xem trước công thức trực tiếp cho câu trả lời ngắn
   */
  const updateShortAnswerPreview = (input) => {
    if (!input) return;
    const qId = input.getAttribute('data-question-id');
    const wrap = input.closest('.short-answer-input-wrap');
    if (!wrap) return;
    const previewBox = wrap.querySelector(`.short-answer-live-preview`);
    if (!previewBox) return;

    const badge = previewBox.querySelector('.preview-badge');
    const content = previewBox.querySelector('.preview-content');
    const val = input.value.trim();

    if (!val) {
      if (badge) badge.classList.add('hidden');
      if (content) content.innerHTML = '';
      return;
    }

    if (badge) badge.classList.remove('hidden');

    // Nếu ô nhập có gắn đơn vị (unit_number)
    const unit = input.getAttribute('data-unit');
    if (unit) {
      if (typeof katex !== 'undefined') {
        try {
          content.innerHTML = katex.renderToString(`${val}\\text{ ${unit}}`, { throwOnError: false });
          return;
        } catch (e) {}
      }
      content.textContent = `${val} ${unit}`;
      return;
    }

    // Chuyển đổi ký tự viết nhanh thành biểu thức LaTeX chuẩn để hiển thị cho học sinh
    if (/[\/\^\*·_;]/.test(val) || /cm|m²/.test(val)) {
      let mathExpr = val
        .replace(/([0-9a-zA-Z]+)\s*\/\s*([0-9a-zA-Z]+)/g, '\\frac{$1}{$2}')
        .replace(/\*/g, ' \\cdot ')
        .replace(/·/g, ' \\cdot ')
        .replace(/m²|m\^2/g, '\\text{ m}^2')
        .replace(/cm²|cm\^2/g, '\\text{ cm}^2')
        .replace(/cm\b/g, '\\text{ cm}')
        .replace(/;/g, ';\\;');
      if (typeof katex !== 'undefined') {
        try {
          content.innerHTML = katex.renderToString(mathExpr, { throwOnError: false });
          return;
        } catch (e) {}
      }
    }
    content.textContent = val;
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
      wrongCount: result.wrongCount,
      details: result.details,
      userAnswers: userAnswers,
      violations: AntiCheat.getViolations(),
      integrity: AntiCheat.getIntegrity(),
      submittedAt: new Date().toISOString(),
    };

    Storage.Submissions.save(submissionData);

    // Xóa bản nháp sau khi đã nộp thành công
    Storage.StudentSession.clearDraft(session.examCode, session.studentId);
    // Giải phóng phiên thi đang chạy để tránh bị kẹt thông tin học sinh cũ khi tải lại trang
    Storage.StudentSession.clear();

    // Hiển thị kết quả & ĐÁP ÁN CHI TIẾT
    showResultModal(submissionData);
  };

  // State quản lý xem lại bài thi & lời giải
  let lastSubmissionData = null;
  let currentReviewFilter = 'all'; // 'all' | 'wrong' | 'correct'
  let areAllSolutionsVisible = true;

  const showResultModal = (data) => {
    lastSubmissionData = data;

    const viewSection = document.getElementById('examViewSection');
    if (viewSection) viewSection.classList.add('hidden');

    const floatBtn = document.getElementById('mobilePaletteToggleBtn');
    if (floatBtn) floatBtn.classList.add('hidden');

    // Ẩn các nút điều khiển nộp bài & timer trên header
    const timerPill = document.getElementById('timerPill');
    if (timerPill) timerPill.classList.add('hidden');

    const submitBtn = document.querySelector('button[onclick*="submitExam"]');
    if (submitBtn) submitBtn.classList.add('hidden');

    const titleBadge = document.getElementById('examTitleBadge');
    if (titleBadge) titleBadge.textContent = 'KẾT QUẢ & XEM LẠI BÀI THI';

    const resSection = document.getElementById('resultViewSection');
    if (resSection) resSection.classList.remove('hidden');

    const nameEl = document.getElementById('resStudentName');
    if (nameEl) nameEl.textContent = data.studentName || 'Học sinh';

    const classEl = document.getElementById('resStudentClass');
    if (classEl) classEl.textContent = data.studentClass ? `• Lớp: ${data.studentClass}` : '';

    const examCodeEl = document.getElementById('resExamCode');
    if (examCodeEl) examCodeEl.textContent = `Mã đề: ${data.examCode || '123456'}`;

    const scoreEl = document.getElementById('resScoreDisplay');
    if (scoreEl) scoreEl.textContent = Number(data.score).toFixed(1).replace('.0', '');

    const countEl = document.getElementById('resCorrectCount');
    if (countEl) countEl.textContent = data.correctCount;

    const ratioEl = document.getElementById('resCorrectRatio');
    if (ratioEl) ratioEl.textContent = `${data.correctCount}/${data.totalCount} câu`;

    const wrongCount = data.wrongCount !== undefined ? data.wrongCount : (data.totalCount - data.correctCount);
    const wrongEl = document.getElementById('resWrongCount');
    if (wrongEl) wrongEl.textContent = wrongCount;

    const intEl = document.getElementById('resIntegrity');
    if (intEl) intEl.textContent = `${data.integrity}%`;

    // Cập nhật số đếm trên bộ lọc
    const countAllEl = document.getElementById('filterCountAll');
    if (countAllEl) countAllEl.textContent = data.totalCount;

    const countWrongEl = document.getElementById('filterCountWrong');
    if (countWrongEl) countWrongEl.textContent = wrongCount;

    const countCorrectEl = document.getElementById('filterCountCorrect');
    if (countCorrectEl) countCorrectEl.textContent = data.correctCount;

    // Render danh sách câu hỏi xem lại chi tiết
    renderReviewQuestions();

    lucide.createIcons();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /**
   * Cuộn xuống vùng chi tiết đáp án & lời giải
   */
  const scrollToReview = () => {
    const el = document.getElementById('reviewContainer');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /**
   * Thiết lập bộ lọc: Tất cả | Chỉ câu sai | Chỉ câu đúng
   */
  const setReviewFilter = (filter) => {
    currentReviewFilter = filter;

    const btnAll = document.getElementById('filterBtnAll');
    const btnWrong = document.getElementById('filterBtnWrong');
    const btnCorrect = document.getElementById('filterBtnCorrect');

    if (btnAll) btnAll.classList.toggle('active', filter === 'all');
    if (btnWrong) btnWrong.classList.toggle('active', filter === 'wrong');
    if (btnCorrect) btnCorrect.classList.toggle('active', filter === 'correct');

    renderReviewQuestions();
  };

  /**
   * Bật/tắt toàn bộ lời giải
   */
  const toggleAllSolutions = () => {
    areAllSolutionsVisible = !areAllSolutionsVisible;
    const boxes = document.querySelectorAll('.review-loigiai-box');
    boxes.forEach(box => {
      box.classList.toggle('hidden', !areAllSolutionsVisible);
    });

    const textEl = document.getElementById('toggleAllSolutionsText');
    if (textEl) {
      textEl.textContent = areAllSolutionsVisible ? 'Ẩn tất cả lời giải' : 'Hiện tất cả lời giải';
    }
  };

  /**
   * Bật/tắt lời giải của một câu riêng biệt
   */
  const toggleQuestionSolution = (qId) => {
    const box = document.getElementById(`solution-box-${qId}`);
    if (box) box.classList.toggle('hidden');
  };

  /**
   * Render danh sách câu hỏi xem lại đáp án chi tiết & lời giải
   */
  const renderReviewQuestions = () => {
    if (!lastSubmissionData || !examData || !examData.questions) return;

    const listEl = document.getElementById('reviewQuestionsList');
    if (!listEl) return;

    const detailsMap = {};
    (lastSubmissionData.details || []).forEach(d => {
      detailsMap[d.questionId] = d;
    });

    const sectionMap = {};
    (examData.sections || []).forEach(s => {
      sectionMap[s.id] = s.title;
    });

    // Lọc theo chế độ: tất cả | chỉ câu sai | chỉ câu đúng
    const filteredQuestions = examData.questions.filter(q => {
      const detail = detailsMap[q.id];
      if (!detail) return currentReviewFilter === 'all';
      if (currentReviewFilter === 'wrong') return detail.isCorrect === false;
      if (currentReviewFilter === 'correct') return detail.isCorrect === true;
      return true;
    });

    if (filteredQuestions.length === 0) {
      let emptyMsg = 'Không có câu hỏi nào trong mục này.';
      if (currentReviewFilter === 'wrong') {
        emptyMsg = '🎉 Tuyệt vời! Bạn không làm sai câu nào!';
      } else if (currentReviewFilter === 'correct') {
        emptyMsg = 'Chưa có câu nào đạt điểm tối đa.';
      }

      listEl.innerHTML = `
        <div class="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
          <p class="text-sm font-bold text-slate-500">${emptyMsg}</p>
          <button onclick="ExamRunner.setReviewFilter('all')" class="mt-3 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl transition-colors">
            Xem tất cả câu hỏi
          </button>
        </div>
      `;
      lucide.createIcons();
      return;
    }

    const html = filteredQuestions.map((q, idx) => {
      const detail = detailsMap[q.id] || { isCorrect: null, earnedPoints: 0, maxPoints: q.points || 0 };
      const sectionTitle = sectionMap[q.sectionId] || '';

      // Tag trạng thái: Đúng / Sai / Chưa làm
      let statusBadge = '';
      if (detail.isCorrect === true) {
        statusBadge = `<span class="bg-emerald-100 text-emerald-800 font-black text-xs px-3 py-1 rounded-full border border-emerald-200 flex items-center gap-1 shrink-0">✓ ĐÚNG (+${detail.earnedPoints}đ)</span>`;
      } else if (q.type === 'truefalse' && detail.earnedPoints > 0) {
        statusBadge = `<span class="bg-indigo-100 text-indigo-800 font-black text-xs px-3 py-1 rounded-full border border-indigo-200 flex items-center gap-1 shrink-0">ĐÚNG ${detail.numMatched}/${detail.totalItems} Ý (+${detail.earnedPoints}đ)</span>`;
      } else if (detail.isCorrect === false) {
        const hasAns = detail.studentAnswer !== null && detail.studentAnswer !== undefined && detail.studentAnswer !== '' && (typeof detail.studentAnswer !== 'object' || Object.values(detail.studentAnswer).some(x => x === true || x === false));
        if (hasAns) {
          statusBadge = `<span class="bg-rose-100 text-rose-800 font-black text-xs px-3 py-1 rounded-full border border-rose-200 flex items-center gap-1 shrink-0">✗ SAI (${detail.earnedPoints || 0}đ / ${detail.maxPoints}đ)</span>`;
        } else {
          statusBadge = `<span class="bg-amber-100 text-amber-800 font-black text-xs px-3 py-1 rounded-full border border-amber-200 flex items-center gap-1 shrink-0">⚪ CHƯA LÀM (0đ / ${detail.maxPoints}đ)</span>`;
        }
      } else {
        statusBadge = `<span class="bg-slate-100 text-slate-700 font-black text-xs px-3 py-1 rounded-full border border-slate-200 shrink-0">Tự luận (${detail.maxPoints}đ)</span>`;
      }

      // Hình ảnh đính kèm (nếu có)
      let imageHtml = '';
      if (q.image) {
        let rawPath = String(q.image).trim();
        let src = rawPath;
        const cleanKey = rawPath.replace(/^(?:images|images_deontap)\//, '');
        const imgs = examData.images || {};
        if (imgs[rawPath]) {
          src = imgs[rawPath];
        } else if (imgs[cleanKey]) {
          src = imgs[cleanKey];
        } else if (imgs['images/' + cleanKey]) {
          src = imgs['images/' + cleanKey];
        } else if (imgs['images_deontap/' + cleanKey]) {
          src = imgs['images_deontap/' + cleanKey];
        } else if (typeof Storage !== 'undefined' && Storage.Images?.get(rawPath)) {
          src = Storage.Images.get(rawPath);
        } else if (!src.startsWith('images/') && !src.startsWith('images_deontap/') && !src.startsWith('http') && !src.startsWith('/') && !src.startsWith('data:')) {
          src = `images/${src}`;
        }
        imageHtml = `
          <div class="my-3 flex justify-center">
            <img src="${src}" alt="Hình câu ${q.id}" class="max-h-60 max-w-full rounded-2xl border border-slate-200 shadow-sm object-contain bg-white p-1" onerror="this.style.display='none'">
          </div>
        `;
      }

      // So sánh phương án trả lời theo từng dạng câu
      let comparisonHtml = '';

      if (q.type === 'choice') {
        const options = q.options || [];
        const optionsHtml = options.map(opt => {
          const isStudentPick = (detail.studentAnswer === opt.letter);
          const isCorrectOpt = Boolean(opt.isCorrect);

          let borderBgClass = 'border-slate-200 bg-white text-slate-700';
          let badgeHtml = '';
          let iconHtml = `<span class="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 font-black text-xs flex items-center justify-center shrink-0 border border-slate-200">${opt.letter}</span>`;

          if (isCorrectOpt && isStudentPick) {
            borderBgClass = 'border-emerald-500 bg-emerald-50/80 text-emerald-950 font-bold ring-2 ring-emerald-200';
            badgeHtml = '<span class="ml-auto text-[11px] font-black text-emerald-700 bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 rounded-full flex items-center gap-1">✓ Bạn chọn chính xác</span>';
            iconHtml = `<span class="w-7 h-7 rounded-lg bg-emerald-600 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-sm">✓</span>`;
          } else if (isCorrectOpt && !isStudentPick) {
            borderBgClass = 'border-emerald-500 bg-emerald-50/80 text-emerald-950 font-bold ring-2 ring-emerald-200';
            badgeHtml = '<span class="ml-auto text-[11px] font-black text-emerald-700 bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 rounded-full flex items-center gap-1">✓ Đáp án đúng</span>';
            iconHtml = `<span class="w-7 h-7 rounded-lg bg-emerald-600 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-sm">✓</span>`;
          } else if (!isCorrectOpt && isStudentPick) {
            borderBgClass = 'border-rose-500 bg-rose-50/80 text-rose-950 font-bold ring-2 ring-rose-200';
            badgeHtml = '<span class="ml-auto text-[11px] font-black text-rose-700 bg-rose-100 border border-rose-300 px-2.5 py-0.5 rounded-full flex items-center gap-1">✗ Bạn đã chọn câu này</span>';
            iconHtml = `<span class="w-7 h-7 rounded-lg bg-rose-600 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-sm">✗</span>`;
          }

          return `
            <div class="flex items-center gap-3 p-3 rounded-xl border ${borderBgClass} transition-all">
              ${iconHtml}
              <span class="text-xs sm:text-sm leading-relaxed">${opt.text}</span>
              ${badgeHtml}
            </div>
          `;
        }).join('');

        const gridClass = (options.length <= 4) ? 'grid grid-cols-1 md:grid-cols-2 gap-2.5 my-3' : 'flex flex-col gap-2.5 my-3';
        comparisonHtml = `<div class="${gridClass}">${optionsHtml}</div>`;

      } else if (q.type === 'truefalse') {
        const tfItems = q.tfItems || [];
        const itemsHtml = tfItems.map(item => {
          const itemRes = detail.itemResults ? detail.itemResults[item.letter] : null;
          const studentVal = itemRes ? itemRes.studentValue : null;
          const correctVal = itemRes ? itemRes.correctValue : Boolean(item.isCorrect);
          const isMatch = itemRes ? itemRes.isMatch : false;

          let studentLabel = studentVal === true ? 'Đúng' : (studentVal === false ? 'Sai' : 'Chưa chọn');
          let studentBadgeClass = studentVal === true || studentVal === false
            ? (isMatch ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-rose-100 text-rose-800 border-rose-300')
            : 'bg-slate-100 text-slate-500 border-slate-200';

          let correctLabel = correctVal ? 'Đúng' : 'Sai';

          return `
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl border ${isMatch ? 'border-emerald-200 bg-emerald-50/30' : 'border-rose-200 bg-rose-50/30'}">
              <div class="text-xs sm:text-sm text-slate-800 font-semibold flex-1">
                <strong class="font-black text-indigo-700">${item.letter})</strong> ${item.text}
              </div>
              <div class="flex items-center gap-2 text-xs shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                <span class="text-slate-400 font-medium">Bạn chọn:</span>
                <span class="font-bold border px-2 py-0.5 rounded-md ${studentBadgeClass}">${studentLabel}</span>
                <span class="text-slate-300">•</span>
                <span class="font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-md">Đáp án: ${correctLabel}</span>
                ${isMatch ? '<span class="text-emerald-600 font-black text-sm">✓</span>' : '<span class="text-rose-600 font-black text-sm">✗</span>'}
              </div>
            </div>
          `;
        }).join('');

        comparisonHtml = `<div class="flex flex-col gap-2 my-3">${itemsHtml}</div>`;

      } else if (q.type === 'shortanswer') {
        const studentAns = String(detail.studentAnswer || '').trim();
        const correctAns = String(detail.correctAnswer || q.shortAnswer || '').trim();
        const isCorrect = detail.isCorrect;

        let displayCorrect = correctAns;
        if (displayCorrect && !displayCorrect.startsWith('$') && (/(\\[a-zA-Z]+|[\\^_{}]|m\^2|cm\^2|\/)/.test(displayCorrect))) {
          displayCorrect = `$${displayCorrect}$`;
        }

        let displayStudent = studentAns;
        if (displayStudent) {
          const unitM = String(correctAns).match(/(?:\\text\s*\{\s*)?(m\^2|cm\^2|cm|m)\b(?:\s*\})?/i);
          if (unitM && /^\d+(\.\d+)?$/.test(displayStudent.trim())) {
            let u = unitM[1];
            if (u.toLowerCase() === 'm^2') u = 'm²';
            if (u.toLowerCase() === 'cm^2') u = 'cm²';
            displayStudent = `$${displayStudent.trim()}\\text{ ${u}}$`;
          } else if (!displayStudent.startsWith('$') && (/(\\[a-zA-Z]+|[\\^_{}]|m\^2|cm\^2|\/)/.test(displayStudent))) {
            displayStudent = `$${displayStudent}$`;
          }
        }

        comparisonHtml = `
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 my-3">
            <div class="p-4 rounded-2xl border ${isCorrect ? 'border-emerald-300 bg-emerald-50/70' : 'border-rose-300 bg-rose-50/70'}">
              <span class="text-[11px] font-black uppercase tracking-wider ${isCorrect ? 'text-emerald-700' : 'text-rose-700'} block mb-1">
                ${isCorrect ? '✓ Câu trả lời của bạn (Chính xác)' : '✗ Câu trả lời của bạn'}
              </span>
              <div class="text-lg font-black font-mono ${isCorrect ? 'text-emerald-900' : 'text-rose-900'}">
                ${displayStudent ? displayStudent : '<span class="text-slate-400 italic font-normal text-sm">(Chưa điền đáp án)</span>'}
              </div>
            </div>
            <div class="p-4 rounded-2xl border border-emerald-300 bg-emerald-50/70">
              <span class="text-[11px] font-black uppercase tracking-wider text-emerald-700 block mb-1">
                ✓ Đáp án chính xác
              </span>
              <div class="text-lg font-black font-mono text-emerald-900">
                ${displayCorrect}
              </div>
            </div>
          </div>
        `;
      }

      // Khung lời giải chi tiết
      const solutionContent = q.solution || '';
      const solutionHtml = solutionContent ? `
        <div class="mt-4 pt-4 border-t border-slate-100">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-black text-amber-800 flex items-center gap-1.5 uppercase tracking-wider">
              <span class="text-base">💡</span> Lời giải chi tiết:
            </span>
            <button onclick="ExamRunner.toggleQuestionSolution('${q.id}')"
              class="text-[11px] font-bold text-amber-700 hover:text-amber-900 bg-amber-100/70 hover:bg-amber-100 px-2.5 py-1 rounded-lg transition-colors">
              Ẩn/Hiện lời giải
            </button>
          </div>
          <div id="solution-box-${q.id}" class="review-loigiai-box p-4 rounded-2xl bg-[#FFFDF5] border border-amber-200/90 shadow-sm text-slate-800 text-sm leading-relaxed loigiai-body ${areAllSolutionsVisible ? '' : 'hidden'}">
            ${solutionContent}
          </div>
        </div>
      ` : `
        <div class="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-400 italic">
          💡 Câu hỏi này chưa có phần giải thích bằng lời giải.
        </div>
      `;

      return `
        <div class="review-card ${detail.isCorrect === true ? 'is-correct' : (detail.isCorrect === false ? 'is-wrong' : '')}" id="review-q-${q.id}">
          <div class="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div class="flex items-center gap-2 min-w-0">
              <span class="px-3 py-1 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-black text-xs shrink-0 shadow-sm">
                Câu ${q.id}
              </span>
              <span class="text-xs font-bold text-slate-400 truncate">${sectionTitle}</span>
            </div>
            ${statusBadge}
          </div>

          <div class="my-3 text-sm text-slate-800 font-medium leading-relaxed">
            ${q.content}
          </div>

          ${imageHtml}

          ${comparisonHtml}

          ${solutionHtml}
        </div>
      `;
    }).join('');

    listEl.innerHTML = html;

    // Render toán KaTeX trong toàn bộ khu vực xem lại bài làm
    KatexRenderer.renderAll(listEl);
    lucide.createIcons();
  };

  return {
    init,
    startExamFromEntry,
    clearStudentEntryForm,
    changeStudentInfo,
    exitExam,
    startNewStudent,
    scrollToQuestion,
    toggleMobilePalette,
    submitExam,
    scrollToReview,
    setReviewFilter,
    toggleAllSolutions,
    toggleQuestionSolution,
  };
})();

if (typeof window !== 'undefined') {
  window.ExamRunner = ExamRunner;
}
