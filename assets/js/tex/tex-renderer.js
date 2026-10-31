/**
 * tex-renderer.js
 * ============================================================
 * Renderer chuyển đổi JSON đề thi (từ TexParser) thành HTML
 * Hiển thị đẹp trên giao diện notebook kiểu giấy thi
 *
 * Tác giả: NoadD.Vo LMS System 3.0
 * Phiên bản: 1.0.0
 * ============================================================
 */

class TexRenderer {
  constructor() {
    // ----------------------------------------------------------------
    // Options mặc định
    // ----------------------------------------------------------------
    this._defaultOptions = {
      mode:          'preview', // 'preview' | 'print' | 'exam'
      showAnswers:   true,      // Hiện đáp án đúng (tô màu)
      showSolutions: false,     // Hiện lời giải
      showAnswerKey: false,     // Hiện bảng đáp án ở cuối
      showHeader:    false,     // Không hiện tiêu đề trường/đề/thông tin HS, bắt đầu thẳng từ Phần 1
      paperStyle:    'grid-oly',// Kiểu giấy (dùng trong paper.css)
      fontClass:     'font-itim',// Font chữ
      paperColor:    '#FDFCF7',  // Màu giấy nền
      imageBasePath: '',        // Đường dẫn gốc cho hình ảnh
    };

    // Nhãn chữ cái đáp án
    this._choiceLetters = ['A', 'B', 'C', 'D', 'E', 'F'];
    this._tfLetters     = ['a', 'b', 'c', 'd'];
  }

  // ==============================================================
  // PUBLIC: Render toàn bộ đề thi
  // ==============================================================
  /**
   * Render toàn bộ đề thi thành HTML string
   * @param {Object} examData - JSON từ TexParser.parse()
   * @param {Object} options  - Tùy chọn hiển thị
   * @returns {string} HTML string hoàn chỉnh
   */
  renderExam(examData, options = {}) {
    const cfg = examData?.config || {};
    const opts = {
      ...this._defaultOptions,
      paperStyle: cfg.paperStyle || this._defaultOptions.paperStyle,
      fontClass:  cfg.fontClass  || this._defaultOptions.fontClass,
      paperColor: cfg.paperColor || this._defaultOptions.paperColor,
      images: { ...(examData?.images || {}), ...(cfg.images || {}), ...(options.images || {}) },
      ...options
    };

    // Nhóm câu hỏi theo section để render tuần tự
    const questionsBySection = this._groupBySection(examData.questions);

    const bgStyle = opts.paperColor ? `style="background-color: ${opts.paperColor};"` : '';
    const examCode = examData?.meta?.examCode || examData?.examCode || '';
    let html = `<div class="exam-paper ${opts.paperStyle} ${opts.fontClass}" ${bgStyle} data-exam-code="${examCode}">`;

    // --- Header & Thông tin học sinh (chỉ render nếu showHeader được bật) ---
    if (opts.showHeader) {
      html += this.renderHeader(examData.meta);
      html += this._renderStudentInfo(opts);
    }

    // --- Nội dung từng phần ---
    const renderedQIds = new Set();
    const sections = (examData.sections && examData.sections.length > 0) ? examData.sections : [];

    for (const section of sections) {
      html += this.renderSection(section);

      const questions = questionsBySection[section.id] || [];
      for (const q of questions) {
        html += this.renderQuestion(q, opts);
        renderedQIds.add(q.id);
      }
    }

    // Render bất kỳ câu hỏi nào còn sót chưa thuộc section nào (chống mất câu hỏi)
    const remainingQuestions = (examData.questions || []).filter(q => !renderedQIds.has(q.id));
    if (remainingQuestions.length > 0) {
      for (const q of remainingQuestions) {
        html += this.renderQuestion(q, opts);
      }
    }

    // --- Bảng đáp án (nếu cần) ---
    if (opts.showAnswerKey && examData.answerKey) {
      html += this._renderAnswerKeyTable(examData.answerKey, examData.questions);
    }

    html += '</div>'; // .exam-paper

    return html;
  }

  // ==============================================================
  // RENDER HEADER
  // ==============================================================
  /**
   * Render tiêu đề đề thi theo layout 2 cột kiểu minipage
   * @param {Object} meta - Thông tin metadata đề thi
   * @returns {string} HTML string
   */
  renderHeader(meta) {
    return `
<div class="exam-header">
  <div class="exam-header-left">
    <div class="school-name">${this._escape(meta.school)}</div>
    <div class="exam-number">(ĐỀ ${this._escape(meta.examNumber)})</div>
  </div>
  <div class="exam-header-center">
    <div class="exam-title">${this._escape(meta.title)}</div>
    <div class="exam-year">NĂM HỌC ${this._escape(meta.year)}</div>
    <div class="exam-subject">Môn: ${this._escape(meta.subject)} — ${this._escape(meta.grade)}</div>
    <div class="exam-duration"><em>Thời gian làm bài: ${meta.duration} phút</em></div>
  </div>
</div>
<div class="exam-header-separator"></div>
`;
  }

  // ==============================================================
  // RENDER SECTION TITLE
  // ==============================================================
  /**
   * Render tiêu đề phần (PHẦN I, II, III, IV)
   * @param {Object} section - Thông tin section
   * @returns {string} HTML string
   */
  renderSection(section) {
    const instrHtml = section.instruction
      ? `<div class="section-instruction">${this._escape(section.instruction)}</div>`
      : '';

    return `
<div class="section-header" data-section-id="${section.id}" data-section-type="${section.type}">
  <div class="section-title">${this._escape(section.title)}</div>
  ${instrHtml}
</div>
`;
  }

  // ==============================================================
  // RENDER CÂU HỎI (điều phối)
  // ==============================================================
  /**
   * Render một câu hỏi — phân loại và gọi hàm render phù hợp
   * @param {Object} question - Dữ liệu câu hỏi
   * @param {Object} options  - Tùy chọn hiển thị
   * @returns {string} HTML string
   */
  renderQuestion(question, options = {}) {
    const opts = { ...this._defaultOptions, ...options };

    switch (question.type) {
      case 'choice':
        return this.renderChoiceQuestion(question, opts);
      case 'truefalse':
        return this.renderTrueFalseQuestion(question, opts);
      case 'shortanswer':
        return this.renderShortAnswerQuestion(question, opts);
      case 'essay':
        return this.renderEssayQuestion(question, opts);
      default:
        return this.renderChoiceQuestion(question, opts);
    }
  }

  // ==============================================================
  // RENDER CÂU TRẮC NGHIỆM NHIỀU PHƯƠNG ÁN
  // ==============================================================
  /**
   * Render câu trắc nghiệm 4 phương án (PHẦN I)
   * @param {Object} question
   * @param {Object} opts
   * @returns {string} HTML string
   */
  renderChoiceQuestion(question, opts) {
    const options = question.options || [];

    // Render từng lựa chọn
    const choicesHtml = options.map(opt => {
      const correctClass = (opts.showAnswers && opt.isCorrect)
        ? ' choice-correct'
        : '';
      // Chế độ exam: học sinh chọn → input radio
      const inputHtml = (opts.mode === 'exam')
        ? `<input type="radio" name="q${question.id}" value="${opt.letter}" class="choice-radio">`
        : '';

      return `
  <div class="choice-item${correctClass}" data-letter="${opt.letter}">
    ${inputHtml}
    <span class="choice-letter">${opt.letter}</span>
    <span class="choice-text">${opt.text}</span>
  </div>`;
    }).join('');

    // Layout 2 cột hay 1 cột tùy độ dài nội dung
    const gridClass = this._shouldUse2Columns(options)
      ? 'choices-grid choices-grid-2col'
      : 'choices-grid choices-grid-1col';

    // Phần hình ảnh (nếu có)
    const imageHtml = this._renderImage(question.image, opts);

    // Lời giải (ẩn mặc định, hiện khi cần)
    const solutionHtml = opts.showSolutions
      ? this.renderSolution(question)
      : `<div class="solution-box hidden" data-question-id="${question.id}">${this._renderSolutionContent(question)}</div>`;

    return `
<div class="question-block" data-question-id="${question.id}" data-type="choice">
  <div class="question-header">
    <span class="question-number">Câu ${question.id}.</span>
    ${opts.showAnswers ? `<span class="question-points">[${question.points} điểm]</span>` : ''}
  </div>
  <div class="question-body${imageHtml ? ' question-has-image' : ''}">
    <div class="question-content">${question.content}</div>
    ${imageHtml}
  </div>
  <div class="${gridClass}">
    ${choicesHtml}
  </div>
  ${solutionHtml}
</div>
`;
  }

  // ==============================================================
  // RENDER CÂU ĐÚNG/SAI (PHẦN II)
  // ==============================================================
  /**
   * Render câu Đúng/Sai với 4 mệnh đề a, b, c, d
   * @param {Object} question
   * @param {Object} opts
   * @returns {string} HTML string
   */
  renderTrueFalseQuestion(question, opts) {
    const items = question.tfItems || [];

    const itemsHtml = items.map(item => {
      const correctClass = (opts.showAnswers && item.isCorrect)
        ? ' tf-item-correct'
        : '';
      const wrongClass = (opts.showAnswers && !item.isCorrect)
        ? ' tf-item-wrong'
        : '';

      // Chế độ exam: học sinh chọn Đ/S cho mỗi mệnh đề
      const inputHtml = (opts.mode === 'exam')
        ? `<div class="tf-input-group">
            <label class="tf-label">
              <input type="radio" name="q${question.id}_${item.letter}" value="true"> Đ
            </label>
            <label class="tf-label">
              <input type="radio" name="q${question.id}_${item.letter}" value="false"> S
            </label>
          </div>`
        : '';

      // Hiện đáp án: icon ✓ hoặc ✗
      const answerBadge = opts.showAnswers
        ? `<span class="tf-badge ${item.isCorrect ? 'tf-true' : 'tf-false'}">${item.isCorrect ? '✓' : '✗'}</span>`
        : (opts.mode !== 'exam')
          ? `<span class="tf-print-box" style="font-size: 11px; font-weight: 700; color: #64748b; border: 1.5px dashed #94a3b8; padding: 2px 8px; border-radius: 6px;">Đúng [ &nbsp; ] &nbsp; Sai [ &nbsp; ]</span>`
          : '';

      return `
  <div class="tf-item${correctClass}${wrongClass}" data-letter="${item.letter}">
    <span class="tf-letter">${item.letter})</span>
    <span class="tf-text">${item.text}</span>
    ${answerBadge}
    ${inputHtml}
  </div>`;
    }).join('');

    const imageHtml  = this._renderImage(question.image, opts);
    const solutionHtml = opts.showSolutions
      ? this.renderSolution(question)
      : `<div class="solution-box hidden" data-question-id="${question.id}">${this._renderSolutionContent(question)}</div>`;

    return `
<div class="question-block" data-question-id="${question.id}" data-type="truefalse">
  <div class="question-header">
    <span class="question-number">Câu ${question.id}.</span>
    ${opts.showAnswers ? `<span class="question-points">[${question.points} điểm]</span>` : ''}
  </div>
  <div class="question-body${imageHtml ? ' question-has-image' : ''}">
    <div class="question-content">${question.content}</div>
    ${imageHtml}
  </div>
  <div class="tf-items-list">
    ${itemsHtml}
  </div>
  ${solutionHtml}
</div>
`;
  }

  // ==============================================================
  // RENDER CÂU TRẢ LỜI NGẮN (PHẦN III)
  // ==============================================================
  /**
   * Render câu điền đáp số ngắn
   * @param {Object} question
   * @param {Object} opts
   * @returns {string} HTML string
   */
  renderShortAnswerQuestion(question, opts) {
    // Chế độ exam: ô nhập liệu kèm thanh công cụ phím nhanh Toán & xem trước công thức
    const answerInputHtml = (opts.mode === 'exam')
      ? `<div class="short-answer-input-wrap">
          <div class="short-answer-input-row">
            <span class="short-answer-label">Đáp số:</span>
            <input type="text"
                   class="short-answer-input"
                   data-question-id="${question.id}"
                   placeholder="Nhập kết quả (hoặc bấm phím nhanh)..."
                   autocomplete="off">
          </div>
          <div class="math-quick-bar">
            <span class="math-quick-title">Phím nhanh:</span>
            <button type="button" class="math-btn" data-insert="/" title="Phân số (dấu gạch chéo)">a/b</button>
            <button type="button" class="math-btn" data-insert="^2" title="Mũ 2 (bình phương)">x²</button>
            <button type="button" class="math-btn" data-insert="^" title="Số mũ / Lũy thừa">xⁿ</button>
            <button type="button" class="math-btn" data-insert=" · " title="Dấu nhân (chấm)">·</button>
            <button type="button" class="math-btn font-bold text-indigo-600" data-insert="; " title="Dấu chấm phẩy ngăn cách">;</button>
            <button type="button" class="math-btn" data-insert="cm" title="Đơn vị cm">cm</button>
            <button type="button" class="math-btn" data-insert="m²" title="Đơn vị mét vuông">m²</button>
            <button type="button" class="math-btn" data-insert="cm²" title="Đơn vị cm vuông">cm²</button>
            <button type="button" class="math-btn" data-insert="()" data-cursor="-1" title="Dấu ngoặc đơn">( )</button>
            <button type="button" class="math-btn math-btn-clear" data-action="clear" title="Xóa nhập lại">✕ Xóa</button>
          </div>
          <div class="short-answer-live-preview" data-preview-for="${question.id}">
            <span class="preview-badge hidden">Hiển thị:</span>
            <span class="preview-content"></span>
          </div>
        </div>`
      : '';

    // Format hiển thị đáp án đẹp cho câu trả lời ngắn (tự bọc $ nếu chứa công thức để KaTeX render chuẩn)
    let formattedAnswer = String(question.shortAnswer || '').trim();
    if (formattedAnswer) {
      if (!formattedAnswer.startsWith('$') && (/(\\[a-zA-Z]+|[\\^_{}]|m\^2|cm\^2|\/)/.test(formattedAnswer))) {
        formattedAnswer = `$${formattedAnswer}$`;
      }
    }

    // Hiện đáp án
    const answerDisplayHtml = (opts.showAnswers && question.shortAnswer)
      ? `<div class="short-answer-display">
          <span class="answer-label">Đáp án:</span>
          <span class="answer-value">${formattedAnswer}</span>
        </div>`
      : (!opts.showAnswers && opts.mode !== 'exam')
        ? `<div class="short-answer-blank" style="margin-top: 10px; font-weight: 700; font-size: 13px; color: #64748b;">Đáp số: ............................................................................</div>`
        : answerInputHtml;

    const imageHtml    = this._renderImage(question.image, opts);
    const solutionHtml = opts.showSolutions
      ? this.renderSolution(question)
      : `<div class="solution-box hidden" data-question-id="${question.id}">${this._renderSolutionContent(question)}</div>`;

    return `
<div class="question-block" data-question-id="${question.id}" data-type="shortanswer">
  <div class="question-header">
    <span class="question-number">Câu ${question.id}.</span>
    ${opts.showAnswers ? `<span class="question-points">[${question.points} điểm]</span>` : ''}
  </div>
  <div class="question-body${imageHtml ? ' question-has-image' : ''}">
    <div class="question-content">${question.content}</div>
    ${imageHtml}
  </div>
  ${answerDisplayHtml}
  ${solutionHtml}
</div>
`;
  }

  // ==============================================================
  // RENDER CÂU TỰ LUẬN (PHẦN IV)
  // ==============================================================
  /**
   * Render câu tự luận với các phần a), b)...
   * @param {Object} question
   * @param {Object} opts
   * @returns {string} HTML string
   */
  renderEssayQuestion(question, opts) {
    const parts = question.essayParts || [];

    // Render từng phần a, b, c
    const partsHtml = parts.map(part => {
      const pointsBadge = (opts.showAnswers && part.points)
        ? `<span class="essay-points">(${part.points} điểm)</span>`
        : '';

      // Chế độ exam: textare cho học sinh
      const textareaHtml = (opts.mode === 'exam')
        ? `<textarea class="essay-answer-textarea"
                    data-question-id="${question.id}"
                    data-part="${part.letter}"
                    placeholder="Nhập bài làm phần ${part.letter})..."
                    rows="4"></textarea>`
        : '<div class="essay-answer-lines"></div>';

      return `
  <div class="essay-part" data-part="${part.letter}">
    <div class="essay-part-header">
      <span class="essay-part-letter">${part.letter})</span>
      ${pointsBadge}
      <span class="essay-part-text">${part.text}</span>
    </div>
    ${textareaHtml}
  </div>`;
    }).join('');

    // Lời giải từng phần
    const solutionContent = this._renderEssaySolutionParts(question.solutionParts);
    const solutionPartsHtml = solutionContent ? (
      opts.showSolutions
        ? solutionContent
        : `<div class="solution-box hidden" data-question-id="${question.id}">${solutionContent}</div>`
    ) : '';

    const imageHtml = this._renderImage(question.image, opts);
    const contentHtml = (question.content && question.content.trim())
      ? `<div class="question-content">${question.content}</div>`
      : '';

    return `
<div class="question-block" data-question-id="${question.id}" data-type="essay">
  <div class="question-header">
    <span class="question-number">Câu ${question.id}.</span>
    <span class="question-points">(${question.points} điểm)</span>
  </div>
  ${(contentHtml || imageHtml) ? `
  <div class="question-body${imageHtml ? ' question-has-image' : ''}">
    ${contentHtml}
    ${imageHtml}
  </div>` : ''}
  <div class="essay-parts">
    ${partsHtml || '<div class="essay-answer-lines essay-answer-lines-long"></div>'}
  </div>
  ${solutionPartsHtml}
</div>
`;
  }

  // ==============================================================
  // RENDER LỜI GIẢI
  // ==============================================================
  /**
   * Render lời giải cho một câu hỏi (hiển thị ngay)
   * @param {Object} question
   * @returns {string} HTML string
   */
  renderSolution(question) {
    const content = this._renderSolutionContent(question);
    if (!content) return '';

    return `
<div class="solution-box solution-visible" data-question-id="${question.id}">
  <div class="solution-header">
    <span class="solution-icon">💡</span>
    <span class="solution-label">Lời giải</span>
  </div>
  <div class="solution-content">${content}</div>
</div>
`;
  }

  // ==============================================================
  // RENDER TOGGLE SOLUTION (cho nút bật/tắt lời giải)
  // ==============================================================
  /**
   * Render nút toggle lời giải và bảng đáp án cho preview mode
   * @param {string} questionId
   * @returns {string} HTML string
   */
  renderSolutionToggleButton(questionId) {
    return `
<button class="btn-toggle-solution"
        onclick="TexRenderer.toggleSolution(${questionId})"
        data-question-id="${questionId}">
  <span class="btn-icon">💡</span>
  <span class="btn-text">Xem lời giải</span>
</button>
`;
  }

  // ==============================================================
  // STATIC METHOD: Toggle solution visibility
  // ==============================================================
  /**
   * Bật/tắt hiển thị lời giải (static, gọi từ onclick)
   * @param {number|string} questionId
   */
  static toggleSolution(questionId) {
    const box = document.querySelector(
      `.solution-box[data-question-id="${questionId}"]`
    );
    if (!box) return;

    const isHidden = box.classList.contains('hidden');
    box.classList.toggle('hidden', !isHidden);
    box.classList.toggle('solution-visible', isHidden);

    // Render KaTeX trong lời giải khi hiện lần đầu
    if (isHidden && typeof renderMathInElement !== 'undefined') {
      renderMathInElement(box, {
        delimiters: [
          { left: '$$', right: '$$', display: true  },
          { left: '$',  right: '$',  display: false },
          { left: '\\(', right: '\\)', display: false },
          { left: '\\[', right: '\\]', display: true  },
        ],
        throwOnError: false,
      });
    }
  }

  // ==============================================================
  // RENDER KaTeX
  // ==============================================================
  /**
   * Render tất cả công thức toán trong container HTML element
   * Gọi sau khi đã inject HTML vào DOM
   * @param {HTMLElement} container - Element chứa nội dung đề thi
   */
  renderKatex(container) {
    if (!container) return;

    // Sử dụng KaTeX auto-render (renderMathInElement)
    if (typeof renderMathInElement !== 'undefined') {
      renderMathInElement(container, {
        delimiters: [
          { left: '$$', right: '$$', display: true  },
          { left: '$',  right: '$',  display: false },
          { left: '\\(', right: '\\)', display: false },
          { left: '\\[', right: '\\]', display: true  },
        ],
        // Các macro tùy chỉnh cho toán THCS Việt Nam
        macros: {
          '\\UCLN':   '\\text{ƯCLN}',
          '\\BCNN':   '\\text{BCNN}',
          '\\True':   '',       // \True được bỏ khi render (đã extract ở parser)
          '\\False':  '',
        },
        throwOnError: false, // Không throw lỗi, hiện nguyên ký tự nếu lỗi
        errorColor:   '#cc0000',
      });
    } else {
      console.warn('[TexRenderer] KaTeX renderMathInElement chưa được load!');
    }
  }

  // ==============================================================
  // RENDER BẢNG ĐÁP ÁN CUỐI ĐỀ
  // ==============================================================
  /**
   * Render bảng đáp án tổng hợp cuối đề
   * @param {Object} answerKey - Đáp án từ parser
   * @param {Object[]} questions - Danh sách câu hỏi
   * @returns {string} HTML string
   */
  _renderAnswerKeyTable(answerKey, questions) {
    let html = `
<div class="answer-key-section">
  <div class="answer-key-title">BẢNG ĐÁP ÁN</div>
`;

    // Phần I: Trắc nghiệm
    if (answerKey.part1 && answerKey.part1.length > 0) {
      const part1Qs = questions.filter(q => q.sectionId === 'part1');
      html += `<div class="answer-key-part">
  <div class="answer-key-part-title">Phần I (Trắc nghiệm):</div>
  <div class="answer-key-grid">`;

      part1Qs.forEach((q, idx) => {
        const answer = answerKey.part1[idx] || '?';
        html += `<div class="answer-key-cell">
      <span class="ak-question">Câu ${q.id}</span>
      <span class="ak-answer">${answer}</span>
    </div>`;
      });
      html += '</div></div>';
    }

    // Phần II: Đúng/Sai
    if (answerKey.part2 && answerKey.part2.length > 0) {
      const part2Qs = questions.filter(q => q.sectionId === 'part2');
      html += `<div class="answer-key-part">
  <div class="answer-key-part-title">Phần II (Đúng/Sai):</div>
  <table class="answer-key-tf-table">
    <thead>
      <tr>
        <th>Câu</th>
        <th>a</th><th>b</th><th>c</th><th>d</th>
      </tr>
    </thead>
    <tbody>`;

      part2Qs.forEach((q, idx) => {
        const answers = answerKey.part2[idx] || [];
        const cells = ['a','b','c','d'].map((letter, i) => {
          const val = answers[i];
          const icon = val === undefined ? '?' : (val ? '✓' : '✗');
          const cls  = val === undefined ? '' : (val ? 'tf-true' : 'tf-false');
          return `<td class="${cls}">${icon}</td>`;
        }).join('');
        html += `<tr><td>Câu ${q.id}</td>${cells}</tr>`;
      });

      html += '</tbody></table></div>';
    }

    // Phần III: Trả lời ngắn
    if (answerKey.part3 && answerKey.part3.length > 0) {
      const part3Qs = questions.filter(q => q.sectionId === 'part3');
      html += `<div class="answer-key-part">
  <div class="answer-key-part-title">Phần III (Trả lời ngắn):</div>
  <div class="answer-key-grid">`;

      part3Qs.forEach((q, idx) => {
        const answer = answerKey.part3[idx] || '?';
        html += `<div class="answer-key-cell">
      <span class="ak-question">Câu ${q.id}</span>
      <span class="ak-answer">${this._escape(answer)}</span>
    </div>`;
      });
      html += '</div></div>';
    }

    html += '</div>'; // .answer-key-section
    return html;
  }

  // ==============================================================
  // PRIVATE HELPERS
  // ==============================================================

  /**
   * Render nội dung lời giải (dùng chung cho hidden/visible)
   */
  _renderSolutionContent(question) {
    if (question.type === 'essay') {
      return this._renderEssaySolutionParts(question.solutionParts);
    }
    return question.solution || '';
  }

  /**
   * Render lời giải từng phần của câu tự luận
   */
  _renderEssaySolutionParts(solutionParts) {
    if (!solutionParts || solutionParts.length === 0) return '';

    const partsHtml = solutionParts.map(part => `
  <div class="solution-part">
    ${part.letter ? `<span class="solution-part-letter">${part.letter})</span>` : ''}
    <div class="solution-part-text">${part.text || ''}</div>
  </div>`).join('');

    return `
<div class="solution-box solution-visible">
  <div class="solution-header">
    <span class="solution-icon">💡</span>
    <span class="solution-label">Lời giải</span>
  </div>
  <div class="solution-content solution-parts">
    ${partsHtml}
  </div>
</div>`;
  }

  /**
   * Render hình ảnh của câu hỏi (nếu có)
   */
  _renderImage(imagePath, opts = {}) {
    if (!imagePath) return '';
    let rawPath = String(imagePath).trim();
    let src = rawPath;

    // 1. Tìm trong options.images hoặc examData.images
    const cleanKey = rawPath.replace(/^(?:images|images_deontap)\//, '');
    const imgs = opts.images || {};
    if (imgs[rawPath]) {
      src = imgs[rawPath];
    } else if (imgs[cleanKey]) {
      src = imgs[cleanKey];
    } else if (imgs['images/' + cleanKey]) {
      src = imgs['images/' + cleanKey];
    } else if (imgs['images_deontap/' + cleanKey]) {
      src = imgs['images_deontap/' + cleanKey];
    }

    // 2. Nếu chưa thấy, tìm trong window.__EXAM_IMAGES__
    if (src === rawPath && typeof window !== 'undefined' && window.__EXAM_IMAGES__) {
      src = window.__EXAM_IMAGES__[rawPath] || window.__EXAM_IMAGES__[cleanKey] || window.__EXAM_IMAGES__['images/' + cleanKey] || window.__EXAM_IMAGES__['images_deontap/' + cleanKey] || src;
    }

    // 3. Nếu chưa thấy, tìm trong Storage.Images
    if (src === rawPath && typeof Storage !== 'undefined' && Storage.Images) {
      const stored = Storage.Images.get(rawPath);
      if (stored) src = stored;
    }

    // 4. Nếu không phải Data URL / URL đầy đủ, chuẩn hóa đường dẫn tương đối
    if (!src.startsWith('data:') && !src.startsWith('blob:') && !src.startsWith('http://') && !src.startsWith('https://')) {
      if (opts.imageBasePath) {
        const base = opts.imageBasePath.replace(/\/+$/, '');
        const path = src.replace(/^\/+/, '');
        if (base.endsWith('/images') && path.startsWith('images/')) {
          src = `${base.slice(0, -7)}/${path}`;
        } else if (path.startsWith('images/')) {
          src = path;
        } else {
          src = `${base}/${path}`;
        }
      }
    }

    return `<div class="question-image-wrap text-center my-3">
  <img src="${this._escape(src)}"
       alt="Hình minh họa"
       class="question-image max-h-64 mx-auto rounded-lg border border-slate-200 shadow-sm object-contain"
       loading="lazy"
       data-src="${this._escape(src)}"
       onerror="this.style.display='none'">
</div>`;
  }

  /**
   * Nhóm câu hỏi theo sectionId
   */
  _groupBySection(questions) {
    const groups = {};
    for (const q of questions) {
      if (!groups[q.sectionId]) groups[q.sectionId] = [];
      groups[q.sectionId].push(q);
    }
    return groups;
  }

  /**
   * Xác định nên dùng 2 cột hay 1 cột cho lựa chọn
   * Dùng 1 cột nếu bất kỳ lựa chọn nào dài hơn 40 ký tự
   */
  _shouldUse2Columns(options) {
    if (!options || options.length === 0) return false;
    return options.every(opt => {
      // Đếm ký tự sau khi bỏ LaTeX commands
      const plain = opt.text.replace(/\$[^$]*\$/g, 'XX').length;
      return plain <= 40;
    });
  }

  /**
   * Render thông tin học sinh (dòng Họ tên, Lớp, SBD)
   */
  _renderStudentInfo(opts) {
    if (opts.mode === 'print') {
      return `
<div class="student-info">
  <div class="student-info-row">
    <span class="si-label">Họ và tên học sinh:</span>
    <span class="si-dots">……………………………………………………………………</span>
    <span class="si-label">Lớp:</span>
    <span class="si-dots">………………</span>
  </div>
</div>
`;
    }
    // Preview và exam: không cần dòng này (đã có thông tin user)
    return '';
  }

  /**
   * Escape HTML để tránh XSS
   * (Không escape trong nội dung LaTeX vì $ sẽ được KaTeX xử lý)
   */
  _escape(str) {
    if (typeof str !== 'string') return String(str ?? '');
    return str
      .replace(/&/g,  '&amp;')
      .replace(/</g,  '&lt;')
      .replace(/>/g,  '&gt;')
      .replace(/"/g,  '&quot;')
      .replace(/'/g,  '&#039;');
  }
}

// ================================================================
// Export cho trình duyệt (window) và Node.js (module)
// ================================================================
if (typeof window !== 'undefined') {
  window.TexRenderer = TexRenderer;

  // Gắn toggleSolution static method vào window để onclick hoạt động
  window.TexRenderer.toggleSolution = TexRenderer.toggleSolution;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TexRenderer };
}
