/**
 * tex-parser.js
 * ============================================================
 * Parser thông minh cho file .tex đề thi Toán THCS Việt Nam
 * Phân tích cấu trúc LaTeX và trả về JSON có cấu trúc rõ ràng
 *
 * Tác giả: NoadD.Vo LMS System 3.0
 * Phiên bản: 1.0.0
 * ============================================================
 */

class TexParser {
  constructor() {
    // ----------------------------------------------------------------
    // Bản đồ sections mặc định theo cấu trúc đề thi chuẩn THCS
    // ----------------------------------------------------------------
    this._sectionMap = {
      'PHẦN I':  { id: 'part1', type: 'choice' },
      'PHẦN II': { id: 'part2', type: 'truefalse' },
      'PHẦN III':{ id: 'part3', type: 'shortanswer' },
      'PHẦN IV': { id: 'part4', type: 'essay' },
    };

    // Chữ cái đáp án cho câu trắc nghiệm
    this._choiceLetters  = ['A', 'B', 'C', 'D'];
    // Chữ cái đáp án cho câu Đúng/Sai và tự luận
    this._tfLetters      = ['a', 'b', 'c', 'd'];
  }

  // ==============================================================
  // PUBLIC: Điểm vào chính của parser
  // ==============================================================
  /**
   * Phân tích nội dung file .tex và trả về object JSON có cấu trúc
   * @param {string} texContent - Nội dung toàn bộ file .tex
   * @returns {Object} examData - JSON đề thi hoàn chỉnh
   */
  parse(texContent) {
    // Bước 1: Tiền xử lý — chuẩn hóa nội dung
    const cleaned = this._preprocess(texContent);

    // Bước 2: Extract meta từ header (minipage đầu tiên)
    const meta = this._extractMeta(cleaned);

    // Bước 3: Extract danh sách sections (phần I, II, III, IV)
    const sections = this._extractSections(cleaned);

    // Bước 4: Extract tất cả câu hỏi
    const questions = this._extractAllQuestions(cleaned, sections);

    // Bước 4.1: Đảm bảo toàn bộ câu hỏi đều có section tương ứng (kể cả khi tạo nhanh từ template mẫu)
    if (questions.length > 0) {
      const defaultSectionDefs = {
        'part1': {
          id: 'part1',
          title: 'PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn',
          instruction: 'Mỗi câu hỏi thí sinh chỉ chọn một phương án.',
          type: 'choice',
          totalPoints: null
        },
        'part2': {
          id: 'part2',
          title: 'PHẦN II. Câu trắc nghiệm đúng sai',
          instruction: 'Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai.',
          type: 'truefalse',
          totalPoints: null
        },
        'part3': {
          id: 'part3',
          title: 'PHẦN III. Câu trắc nghiệm trả lời ngắn',
          instruction: 'Thí sinh điền câu trả lời ngắn vào ô tương ứng.',
          type: 'shortanswer',
          totalPoints: null
        },
        'part4': {
          id: 'part4',
          title: 'PHẦN IV. Tự luận',
          instruction: 'Thí sinh trình bày lời giải chi tiết.',
          type: 'essay',
          totalPoints: null
        }
      };

      const existingSectionIds = new Set(sections.map(s => s.id));
      for (const q of questions) {
        const sId = q.sectionId || 'part1';
        if (!existingSectionIds.has(sId)) {
          existingSectionIds.add(sId);
          sections.push(defaultSectionDefs[sId] || {
            id: sId,
            title: `Phần ${sections.length + 1}`,
            instruction: '',
            type: q.type || 'choice',
            totalPoints: null
          });
        }
      }
      const order = { 'part1': 1, 'part2': 2, 'part3': 3, 'part4': 4 };
      sections.sort((a, b) => (order[a.id] || 99) - (order[b.id] || 99));
    }

    // Bước 5: Tổng hợp answer key
    const answerKey = this._buildAnswerKey(questions);

    return { meta, sections, questions, answerKey };
  }

  // ==============================================================
  // BƯỚC 1: TIỀN XỬ LÝ
  // ==============================================================
  /**
   * Chuẩn hóa nội dung .tex trước khi parse:
   * - Giữ nguyên dòng comment LaTeX (% ...) vì chứa số câu
   * - Xóa các lệnh layout không cần thiết
   * - Chuẩn hóa xuống dòng
   */
  _preprocess(tex) {
    let s = tex;

    // Xóa \setcounter{ex}{N} — không cần thiết cho parse
    s = s.replace(/\\setcounter\{ex\}\{\d+\}/g, '');

    // Convert \begin{align*}...\end{align*} → $$\begin{aligned}...\end{aligned}$$
    s = s.replace(/\\begin\{align\*?\}([\s\S]*?)\\end\{align\*?\}/g,
      (_, body) => `$$\\begin{aligned}${body.trim()}\\end{aligned}$$`);

    // Convert \begin{equation*}...\end{equation*} → $$...$$
    s = s.replace(/\\begin\{equation\*?\}([\s\S]*?)\\end\{equation\*?\}/g,
      (_, body) => `$$${body.trim()}$$`);

    // Xóa các lệnh layout (không ảnh hưởng đến nội dung)
    s = s.replace(/\\vspace\*?\{[^}]*\}/g, '');
    s = s.replace(/\\hspace\*?\{[^}]*\}/g, ' ');
    s = s.replace(/\\noindent\b/g, '');
    s = s.replace(/\\hfill\b/g, '');
    s = s.replace(/\\newpage\b/g, '');
    s = s.replace(/\\clearpage\b/g, '');
    s = s.replace(/\\pagestyle\{[^}]*\}/g, '');
    s = s.replace(/\\thispagestyle\{[^}]*\}/g, '');
    s = s.replace(/\\maketitle\b/g, '');

    // Xóa \dotfill
    s = s.replace(/\\dotfill\{?\}?/g, '……………………………………');

    // Chuẩn hóa xuống dòng
    s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    return s;
  }

  // ==============================================================
  // BƯỚC 2: EXTRACT META
  // ==============================================================
  /**
   * Trích xuất thông tin header đề thi từ cấu trúc minipage đầu tiên
   */
  _extractMeta(tex) {
    const meta = {
      examCode:   this._generateExamCode(),
      title:      '',
      subject:    '',
      grade:      '',
      year:       '',
      duration:   90,
      school:     '',
      examNumber: '1',
      totalPages: 2,
    };

    // ----- Tên trường: từ \textbf{} đầu tiên trong minipage đầu -----
    const schoolMatch = tex.match(
      /\\begin\{minipage\}[^}]*\}[^{]*\\textbf\{([^}]+)\}/
    );
    if (schoolMatch) {
      meta.school = this._cleanText(schoolMatch[1]);
    }

    // ----- Số đề: (ĐỀ N) -----
    const deMatch = tex.match(/\(ĐỀ\s*(\d+)\)/i);
    if (deMatch) meta.examNumber = deMatch[1];

    // ----- Tiêu đề đề thi (dòng \textbf lớn nhất trong minipage thứ 2 hoặc chứa ĐỀ KIỂM TRA / ÔN TẬP) -----
    const titleMatch = tex.match(/\\textbf\{(ĐỀ\s+KIỂM\s+TRA[^}]+)\}/i) ||
                       tex.match(/\{\\Large\\bfseries\s+([^}]+)\}/i) ||
                       tex.match(/\\textbf\{(ÔN\s+TẬP[^}]+)\}/i) ||
                       tex.match(/\\begin\{minipage\}[^}]*\}[\s\S]*?\\textbf\{(ĐỀ[^}]+)\}/i) ||
                       tex.match(/\\textbf\{(ĐỀ[^}]+)\}/i) ||
                       tex.match(/(ÔN\s+TẬP\s+TOÁN[^\n\\]+)/i);
    if (titleMatch) {
      meta.title = this._cleanText(titleMatch[1]);
    }

    // ----- Năm học -----
    const yearMatch = tex.match(/NĂM HỌC\s+([\d\s\-–—]+)/i);
    if (yearMatch) meta.year = yearMatch[1].trim();

    // ----- Môn và lớp -----
    const monMatch = tex.match(/Môn:\s*([^-–—\\]+)[-–—]+\s*Lớp\s*([^\\}\s]+)/i);
    if (monMatch) {
      meta.subject = monMatch[1].trim();
      meta.grade   = `Lớp ${monMatch[2].trim()}`;
    } else if (meta.title && /TOÁN\s*(\d+)/i.test(meta.title)) {
      const gMatch = meta.title.match(/TOÁN\s*(\d+)/i);
      meta.subject = 'Toán';
      meta.grade   = `Lớp ${gMatch[1]}`;
    }

    // ----- Thời gian: số phút -----
    const tgMatch = tex.match(/Thời gian[^:]*:\s*(\d+)\s*phút/i);
    if (tgMatch) meta.duration = parseInt(tgMatch[1], 10);

    return meta;
  }

  // ==============================================================
  // BƯỚC 3: EXTRACT SECTIONS
  // ==============================================================
  /**
   * Trích xuất danh sách các phần trong đề thi
   * Tìm pattern: \textbf{PHẦN I. ...}
   */
  _extractSections(tex) {
    const sections = [];
    // Pattern tìm \textbf{PHẦN ...} hoặc \textbf{\textit{...}} v.v.
    const sectionPattern = /\\textbf\{(PHẦN\s+[IVX]+[^}]+)\}/gi;

    let match;
    while ((match = sectionPattern.exec(tex)) !== null) {
      const rawTitle = match[1].trim();

      // Xác định id và type từ chữ số La Mã chính xác (I, II, III, IV)
      const romanMatch = rawTitle.match(/^PHẦN\s+([IVX]+)\b/i);
      let sectionInfo = { id: `part${sections.length + 1}`, type: 'choice' };
      
      if (romanMatch) {
        const roman = romanMatch[1].toUpperCase();
        const romanMap = {
          'I':   { id: 'part1', type: 'choice' },
          'II':  { id: 'part2', type: 'truefalse' },
          'III': { id: 'part3', type: 'shortanswer' },
          'IV':  { id: 'part4', type: 'essay' }
        };
        if (romanMap[roman]) {
          sectionInfo = romanMap[roman];
        }
      }

      // Tránh trùng lặp (ví dụ gặp lại tiêu đề phần ở bảng đáp án cuối bài)
      if (sections.find(s => s.id === sectionInfo.id)) continue;

      // Trích xuất điểm từ tiêu đề: (X,0 điểm)
      const pointsMatch = rawTitle.match(/\((\d+[,\.]\d*)\s*điểm\)/i);
      const totalPoints = pointsMatch
        ? parseFloat(pointsMatch[1].replace(',', '.'))
        : null;

      // Trích xuất hướng dẫn (câu hỏi từ ... đến ...)
      const instrMatch = rawTitle.match(/Thí sinh trả lời[^.]+\./i)
        || rawTitle.match(/Mỗi câu[^.]+\./i);

      sections.push({
        id:          sectionInfo.id,
        title:       this._cleanText(rawTitle),
        instruction: instrMatch ? instrMatch[0].trim() : '',
        type:        sectionInfo.type,
        totalPoints: totalPoints,
      });
    }

    return sections;
  }

  // ==============================================================
  // BƯỚC 4: EXTRACT CÂU HỎI
  // ==============================================================
  /**
   * Trích xuất tất cả câu hỏi từ nội dung .tex
   */
  _extractAllQuestions(tex, sections) {
    const questions = [];
    let questionNumber = 0;

    // ----- Parse câu \begin{ex}...\end{ex} -----
    const exBlocks = this._extractBlocks(tex, 'ex');
    for (const block of exBlocks) {
      questionNumber++;
      const q = this._parseExBlock(block, questionNumber, sections);
      if (q) questions.push(q);
    }

    // ----- Parse câu \begin{bt}...\end{bt} (bài tập / tự luận) -----
    const btBlocks = this._extractBlocks(tex, 'bt');
    for (const block of btBlocks) {
      questionNumber++;
      const q = this._parseBtBlock(block, questionNumber, sections);
      if (q) questions.push(q);
    }

    return questions;
  }

  /**
   * Trích xuất tất cả block \begin{envName}...\end{envName}
   * Hỗ trợ lồng nhau bằng cách đếm mức lồng
   * @param {string} tex
   * @param {string} envName - 'ex' | 'bt'
   * @returns {string[]} Mảng nội dung bên trong mỗi block
   */
  _extractBlocks(tex, envName) {
    const blocks = [];
    const openTag  = `\\begin{${envName}}`;
    const closeTag = `\\end{${envName}}`;

    let pos = 0;
    while (pos < tex.length) {
      const start = tex.indexOf(openTag, pos);
      if (start === -1) break;

      // Đếm mức lồng để tìm \end{envName} tương ứng
      let depth = 1;
      let cur   = start + openTag.length;

      while (cur < tex.length && depth > 0) {
        const nextOpen  = tex.indexOf(openTag,  cur);
        const nextClose = tex.indexOf(closeTag, cur);

        if (nextClose === -1) break; // Không tìm thấy closing tag

        if (nextOpen !== -1 && nextOpen < nextClose) {
          depth++;
          cur = nextOpen + openTag.length;
        } else {
          depth--;
          if (depth === 0) {
            // Lấy nội dung bên trong block (không bao gồm tag)
            blocks.push(tex.substring(start + openTag.length, nextClose));
            cur = nextClose + closeTag.length;
          } else {
            cur = nextClose + closeTag.length;
          }
        }
      }

      pos = cur;
    }

    return blocks;
  }

  /**
   * Parse một block \begin{ex}...\end{ex}
   * Xác định type dựa trên: \choice, \choiceTF, \shortans
   */
  _parseExBlock(blockContent, number, sections) {
    // Comment LaTeX thường chứa số câu: %Câu 1
    const commentMatch = blockContent.match(/^%[Cc]âu\s*(\d+)/);
    const qNumber = commentMatch ? parseInt(commentMatch[1], 10) : number;

    // Xác định type câu hỏi
    let type = 'choice';
    if (/\\choiceTF\b/.test(blockContent)) type = 'truefalse';
    else if (/\\shortans\b/.test(blockContent)) type = 'shortanswer';

    // Xác định section
    const sectionId = this._getSectionId(type, sections);

    // Tách nội dung câu hỏi khỏi phần \choice/\choiceTF/\shortans
    const content = this._extractQuestionContent(blockContent, type);

    // Extract hình ảnh
    const image = this._extractImage(blockContent);

    // Extract lời giải
    const solution = this._extractSolution(blockContent);

    // Parse options/tfItems/shortAnswer
    const question = {
      id:       qNumber,
      sectionId,
      type,
      content:  this._cleanTexContent(content),
      image,
      solution: solution ? this._cleanTexContent(solution) : null,
      points:   this._getDefaultPoints(type, sections, sectionId),
    };

    if (type === 'choice') {
      question.options    = this._parseChoiceOptions(blockContent);
      question.tfItems    = null;
      question.shortAnswer= null;
      question.essayParts = null;
      question.solutionParts = null;
    } else if (type === 'truefalse') {
      question.options    = null;
      question.tfItems    = this._parseTFItems(blockContent);
      question.shortAnswer= null;
      question.essayParts = null;
      question.solutionParts = null;
    } else if (type === 'shortanswer') {
      question.options    = null;
      question.tfItems    = null;
      question.shortAnswer= this._parseShortAnswer(blockContent);
      question.essayParts = null;
      question.solutionParts = null;
    }

    return question;
  }

  /**
   * Parse một block \begin{bt}...\end{bt} (tự luận)
   */
  _parseBtBlock(blockContent, number, sections) {
    const commentMatch = blockContent.match(/^%[Cc]âu\s*(\d+)/);
    const qNumber = commentMatch ? parseInt(commentMatch[1], 10) : number;

    const sectionId = this._getSectionId('essay', sections);

    // 1. Tách rõ ràng phần Đề bài và phần Lời giải
    let questionText = blockContent;
    let solutionText = '';

    const loiGiaiBeginMatch = blockContent.match(/\\begin\{loigiai\}/);
    const loiGiaiCmdMatch   = blockContent.match(/\\loigiai\{/);

    if (loiGiaiBeginMatch) {
      const idx = loiGiaiBeginMatch.index;
      questionText = blockContent.substring(0, idx);
      const afterBegin = blockContent.substring(idx + '\\begin{loigiai}'.length);
      const endIdx = afterBegin.lastIndexOf('\\end{loigiai}');
      solutionText = endIdx !== -1 ? afterBegin.substring(0, endIdx) : afterBegin;
    } else if (loiGiaiCmdMatch) {
      const idx = loiGiaiCmdMatch.index;
      questionText = blockContent.substring(0, idx);
      solutionText = this._extractBalancedBrace(blockContent, idx + '\\loigiai'.length) || '';
    }

    // 2. Điểm từ tiêu đề: (N,0 điểm)
    const pMatch = questionText.match(/\((\d+[,\.]?\d*)\s*điểm\)/i);
    const points = pMatch ? parseFloat(pMatch[1].replace(',', '.')) : 1.0;

    // Xóa điểm số khỏi questionText để không bị lặp lại trong nội dung
    questionText = questionText.replace(/\(\d+[,\.]?\d*\s*điểm\)\.?/i, '').trim();

    // 3. Phân tách câu hỏi: phần dẫn và các phần a), b) trong \begin{enumerate}
    let content = '';
    let essayParts = [];

    const enumMatch = questionText.match(/\\begin\{enumerate\}(?:\s*\[[^\]]*\])?([\s\S]*?)\\end\{enumerate\}/);
    if (enumMatch) {
      content = questionText.substring(0, enumMatch.index).trim();
      essayParts = this._parseEnumerateItems(enumMatch[1]);
    } else {
      content = questionText.trim();
    }

    // 4. Phân tách lời giải của các phần a), b)
    let solutionParts = [];
    if (solutionText.trim()) {
      const solEnumMatch = solutionText.match(/\\begin\{enumerate\}(?:\s*\[[^\]]*\])?([\s\S]*?)\\end\{enumerate\}/);
      if (solEnumMatch) {
        solutionParts = this._parseEnumerateItems(solEnumMatch[1]);
      } else {
        solutionParts = [{ letter: '', text: this._cleanTexContent(solutionText.trim()) }];
      }
    }

    // 5. Extract hình ảnh
    const image = this._extractImage(blockContent);

    return {
      id:            qNumber,
      sectionId,
      type:          'essay',
      content:       this._cleanTexContent(content),
      options:       null,
      tfItems:       null,
      shortAnswer:   null,
      essayParts:    essayParts.length ? essayParts : null,
      solution:      this._cleanTexContent(solutionText),
      solutionParts: solutionParts.length ? solutionParts : null,
      image,
      points,
    };
  }

  // ==============================================================
  // PARSE CÁC LOẠI ĐÁP ÁN
  // ==============================================================

  /**
   * Parse các lựa chọn từ \choice
   * Format: \choice {A} {B} {\True C} {D}
   */
  _parseChoiceOptions(blockContent) {
    const choiceMatch = blockContent.match(/\\choice(?!TF)\b(?:\[[^\]]*\])?([\s\S]*?)(?=\\loigiai|$)/);
    if (!choiceMatch) return [];

    const choiceBlock = choiceMatch[1];
    const items = this._extractConsecutiveBracedArgs(choiceBlock, 4);
    const options = [];

    items.forEach((text, index) => {
      const isCorrect = text.includes('\\True');
      const cleanText = text.replace(/\\True\s*/g, '').trim();
      options.push({
        letter:    this._choiceLetters[index] || String.fromCharCode(65 + index),
        text:      this._cleanTexContent(cleanText),
        isCorrect,
      });
    });

    return options;
  }

  /**
   * Parse các items từ \choiceTF
   * Format: \choiceTF {\True a} {b} {\True c} {d}
   */
  _parseTFItems(blockContent) {
    const tfMatch = blockContent.match(/\\choiceTF\b(?:\[[^\]]*\])?([\s\S]*?)(?=\\loigiai|$)/);
    if (!tfMatch) return [];

    const tfBlock = tfMatch[1];
    const items = this._extractConsecutiveBracedArgs(tfBlock, 4);
    const result  = [];

    items.forEach((text, index) => {
      const isCorrect = text.includes('\\True');
      const cleanText = text.replace(/\\True\s*/g, '').trim();
      result.push({
        letter:    this._tfLetters[index] || String.fromCharCode(97 + index),
        text:      this._cleanTexContent(cleanText),
        isCorrect,
      });
    });

    return result;
  }

  /**
   * Parse đáp án ngắn từ \shortans{answer}
   */
  _parseShortAnswer(blockContent) {
    const idx = blockContent.indexOf('\\shortans{');
    if (idx !== -1) {
      const startIdx = idx + '\\shortans{'.length;
      const ans = this._extractBalancedBrace(blockContent, startIdx - 1);
      if (ans !== null) return ans.trim();
    }
    const m = blockContent.match(/\\shortans\{([^}]*)\}/);
    return m ? m[1].trim() : '';
  }

  /**
   * Parse các \item bên trong \begin{enumerate}
   * Chỉ tách ở độ sâu 0 để không bị tách nhầm \item trong \begin{itemize}
   */
  _parseEnumerateItems(enumContent) {
    const parts = [];
    const letters = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const itemPositions = [];
    let envDepth = 0;

    const tokenRegex = /(\\begin\{(?:itemize|enumerate|itemchoice)\}|\\end\{(?:itemize|enumerate|itemchoice)\}|\\item\b)/g;
    let match;
    while ((match = tokenRegex.exec(enumContent)) !== null) {
      const token = match[1];
      if (token.startsWith('\\begin{')) {
        envDepth++;
      } else if (token.startsWith('\\end{')) {
        if (envDepth > 0) envDepth--;
      } else if (token === '\\item' && envDepth === 0) {
        itemPositions.push({ start: match.index, end: match.index + match[0].length });
      }
    }

    if (itemPositions.length === 0) {
      const plain = enumContent.split(/\\item\b/);
      plain.forEach((item, idx) => {
        if (idx === 0) return;
        const text = item.trim();
        if (!text) return;
        parts.push({
          letter: letters[idx - 1] || String.fromCharCode(96 + idx),
          text:   this._cleanTexContent(text),
          points: null,
        });
      });
      return parts;
    }

    for (let i = 0; i < itemPositions.length; i++) {
      const textStart = itemPositions[i].end;
      const textEnd = (i + 1 < itemPositions.length) ? itemPositions[i + 1].start : enumContent.length;
      let rawText = enumContent.substring(textStart, textEnd).trim();
      if (!rawText) continue;

      const pMatch = rawText.match(/\((\d+[,\.]?\d*)\s*điểm\)/i);
      const points = pMatch ? parseFloat(pMatch[1].replace(',', '.')) : null;
      rawText = rawText.replace(/\(\d+[,\.]?\d*\s*điểm\)\.?/i, '').trim();

      parts.push({
        letter: letters[i] || String.fromCharCode(97 + i),
        text:   this._cleanTexContent(rawText),
        points,
      });
    }

    return parts;
  }

  // ==============================================================
  // EXTRACT HELPERS
  // ==============================================================

  /**
   * Tách nội dung câu hỏi (bỏ phần sau \choice/\choiceTF/\shortans/\loigiai)
   */
  _extractQuestionContent(blockContent, type) {
    let stopPattern;
    if (type === 'choice')      stopPattern = /\\choice(?!TF)\b/;
    else if (type === 'truefalse')   stopPattern = /\\choiceTF\b/;
    else if (type === 'shortanswer') stopPattern = /\\shortans\b/;
    else                             stopPattern = /\\begin\{loigiai\}|\\begin\{enumerate\}/;

    const idx = blockContent.search(stopPattern);
    const raw = idx !== -1 ? blockContent.substring(0, idx) : blockContent;

    // Bỏ phần comment LaTeX đầu dòng: %Câu N
    return raw.replace(/^%[^\n]*\n?/, '').trim();
  }

  /**
   * Extract đường dẫn hình ảnh từ \includegraphics[...]{path}
   */
  _extractImage(blockContent) {
    const m = blockContent.match(/\\includegraphics[^{]*\{([^}]+)\}/);
    return m ? m[1].trim() : null;
  }

  /**
   * Extract lời giải từ \loigiai{...} hoặc \begin{loigiai}...\end{loigiai}
   */
  _extractSolution(blockContent) {
    // Dạng \loigiai{...} với ngoặc có thể lồng nhau
    const cmdMatch = blockContent.match(/\\loigiai\{/);
    if (cmdMatch) {
      const startIdx = blockContent.indexOf('\\loigiai{') + '\\loigiai{'.length;
      return this._extractBalancedBrace(blockContent, startIdx - 1);
    }

    // Dạng \begin{loigiai}...\end{loigiai}
    const envMatch = blockContent.match(
      /\\begin\{loigiai\}([\s\S]*?)\\end\{loigiai\}/
    );
    return envMatch ? envMatch[1].trim() : null;
  }

  /**
   * Trích xuất nội dung trong dấu ngoặc nhọn cân bằng bắt đầu tại vị trí pos
   * @param {string} s - Chuỗi nguồn
   * @param {number} openPos - Vị trí của dấu '{' mở
   */
  _extractBalancedBrace(s, openPos) {
    // Tìm dấu '{' tại hoặc sau openPos
    let start = s.indexOf('{', openPos);
    if (start === -1) return null;

    let depth = 1;
    let i     = start + 1;

    while (i < s.length && depth > 0) {
      if (s[i] === '{') depth++;
      else if (s[i] === '}') depth--;
      i++;
    }

    return s.substring(start + 1, i - 1).trim();
  }

  /**
   * Trích xuất các đối số trong ngoặc nhọn {} liên tiếp
   * Hỗ trợ ngoặc lồng nhau
   * @param {string} s - Chuỗi cần phân tích
   * @returns {string[]} Mảng nội dung trong từng cặp {}
   */
  _extractBracedArgs(s) {
    const results = [];
    let i = 0;

    while (i < s.length) {
      // Tìm dấu '{' tiếp theo
      const openIdx = s.indexOf('{', i);
      if (openIdx === -1) break;

      // Tìm dấu '}' tương ứng (cân bằng)
      let depth = 1;
      let j     = openIdx + 1;

      while (j < s.length && depth > 0) {
        if (s[j] === '{') depth++;
        else if (s[j] === '}') depth--;
        j++;
      }

      results.push(s.substring(openIdx + 1, j - 1));
      i = j;
    }

    return results;
  }

  /**
   * Trích xuất các đối số trong ngoặc nhọn {} liên tiếp trực tiếp sau lệnh
   * Chỉ trích xuất tối đa maxArgs (mặc định 4) và dừng ngay khi gặp ký tự khác
   */
  _extractConsecutiveBracedArgs(s, maxArgs = 4) {
    const results = [];
    let i = 0;
    while (i < s.length && /\s/.test(s[i])) i++;

    while (i < s.length && results.length < maxArgs) {
      if (s[i] !== '{') break;
      const openIdx = i;
      let depth = 1;
      let j = openIdx + 1;
      while (j < s.length && depth > 0) {
        if (s[j] === '{') depth++;
        else if (s[j] === '}') depth--;
        j++;
      }
      results.push(s.substring(openIdx + 1, j - 1).trim());
      i = j;
      while (i < s.length && /\s/.test(s[i])) i++;
    }

    return results;
  }

  /**
   * Lấy nội dung enumerate đầu tiên trong block
   */
  _getFirstEnumerate(blockContent) {
    const m = blockContent.match(
      /\\begin\{enumerate\}[^\{]*([\s\S]*?)\\end\{enumerate\}/
    );
    return m ? m[1] : null;
  }

  // ==============================================================
  // BƯỚC 5: BUILD ANSWER KEY
  // ==============================================================
  /**
   * Tổng hợp đáp án từ danh sách câu hỏi
   */
  _buildAnswerKey(questions) {
    const answerKey = {};

    // Nhóm câu hỏi theo section
    const bySection = {};
    for (const q of questions) {
      if (!bySection[q.sectionId]) bySection[q.sectionId] = [];
      bySection[q.sectionId].push(q);
    }

    // Phần I: TN nhiều phương án → mảng chữ cái đáp án đúng
    if (bySection.part1) {
      answerKey.part1 = bySection.part1.map(q => {
        if (!q.options) return null;
        const correct = q.options.find(o => o.isCorrect);
        return correct ? correct.letter : null;
      });
    }

    // Phần II: Đúng/Sai → mảng mảng boolean
    if (bySection.part2) {
      answerKey.part2 = bySection.part2.map(q => {
        if (!q.tfItems) return [];
        return q.tfItems.map(item => item.isCorrect);
      });
    }

    // Phần III: Trả lời ngắn → mảng string
    if (bySection.part3) {
      answerKey.part3 = bySection.part3.map(q => q.shortAnswer || '');
    }

    // Phần IV: Tự luận → không có đáp án tự động
    if (bySection.part4) {
      answerKey.part4 = null;
    }

    return answerKey;
  }

  // ==============================================================
  // UTILITY METHODS
  // ==============================================================

  /**
   * Xác định sectionId dựa trên type câu hỏi và danh sách sections
   */
  _getSectionId(type, sections) {
    const typeMap = {
      'choice':      'part1',
      'truefalse':   'part2',
      'shortanswer': 'part3',
      'essay':       'part4',
    };
    const defaultId = typeMap[type] || 'part1';

    // Kiểm tra xem section có tồn tại không
    const exists = sections.find(s => s.id === defaultId);
    return exists ? defaultId : defaultId; // fallback
  }

  /**
   * Lấy điểm mặc định cho mỗi câu hỏi dựa trên loại
   */
  _getDefaultPoints(type, sections, sectionId) {
    // Điểm chuẩn theo cấu trúc đề thi chuẩn BGD (Tổng 10 điểm):
    // - Phần I (Trắc nghiệm): 12 câu x 0.25 = 3.0 điểm
    // - Phần II (Đúng/Sai): 2 câu x 1.0 = 2.0 điểm
    // - Phần III (Trả lời ngắn): 4 câu x 0.5 = 2.0 điểm
    // - Phần IV (Tự luận): 3 câu x 1.0 = 3.0 điểm
    const defaults = { choice: 0.25, truefalse: 1.0, shortanswer: 0.5, essay: 1.0 };
    return defaults[type] || 0.25;
  }

  /**
   * Tạo mã đề thi ngẫu nhiên (chỉ gồm các chữ số)
   */
  _generateExamCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  /**
   * Làm sạch text đơn giản (bỏ các lệnh LaTeX không cần thiết)
   * Giữ nguyên math ($...$, $$...$$) để KaTeX render
   */
  _cleanText(text) {
    return text
      .replace(/\\textbf\{([^}]+)\}/g,  '$1')
      .replace(/\\textit\{([^}]+)\}/g,  '$1')
      .replace(/\\emph\{([^}]+)\}/g,    '$1')
      .replace(/\\text\{([^}]+)\}/g,    '$1')
      .replace(/\\underline\{([^}]+)\}/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Làm sạch nội dung LaTeX đầy đủ:
   * - Giữ nguyên math, \textbf, \textit
   * - Xóa các lệnh layout thừa
   * - Xóa comment %Câu N
   */
  _cleanTexContent(tex) {
    if (!tex) return '';

    let s = tex;

    // 1. Bỏ comment LaTeX đầu dòng
    s = s.replace(/^%[^\n]*\n?/gm, '');

    // 2. Xóa môi trường minipage (giữ nội dung)
    s = s.replace(/\\begin\{minipage\}(?:\[[^\]]*\])?\{[^}]*\}/g, '');
    s = s.replace(/\\end\{minipage\}/g, '');

    // 3. Xóa lệnh sizing trong includegraphics đã được extract
    s = s.replace(/\\includegraphics(?:\[[^\]]*\])?\{[^}]+\}/g, '');

    // 4. Chuyển đổi môi trường itemchoice (lời giải câu đúng sai)
    s = s.replace(/\\begin\{itemchoice\}([\s\S]*?)\\end\{itemchoice\}/g, (_, inner) => {
      const items = inner.split(/\\item\b/).map(x => x.trim()).filter(Boolean);
      return `<div class="loigiai-itemchoice">${items.map(it => `<div class="loigiai-row">• ${it}</div>`).join('\n')}</div>`;
    });

    // 5. Chuyển đổi môi trường itemize thành danh sách HTML
    s = s.replace(/\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g, (_, inner) => {
      const items = inner.split(/\\item\b/).map(x => x.trim()).filter(Boolean);
      return `<ul class="exam-bullet-list">${items.map(it => `<li>${it}</li>`).join('')}</ul>`;
    });

    // 6. Xóa các thẻ môi trường sót lại nếu có
    s = s.replace(/\\(?:begin|end)\{itemchoice\}/g, '');
    s = s.replace(/\\(?:begin|end)\{itemize\}/g, '');
    s = s.replace(/\\(?:begin|end)\{enumerate\}(?:\[[^\]]*\])?/g, '');
    s = s.replace(/\\(?:begin|end)\{loigiai\}/g, '');
    s = s.replace(/\\(?:begin|end)\{center\}/g, '');

    // 7. Thay thế bất kỳ \item nào còn lại thành dấu bullet •
    s = s.replace(/\\item\s*/g, '• ');

    // 8. Chuyển đổi \\ ngoài công thức toán ($...$, $$...$$) thành <br>
    const tokens = s.split(/(\$\$[\s\S]*?\$\$|\$[^$]*?\$)/g);
    for (let i = 0; i < tokens.length; i++) {
      if (i % 2 === 0) {
        tokens[i] = tokens[i].replace(/\\\\/g, '<br>');
      }
    }
    s = tokens.join('');

    // 9. Xóa các lệnh layout
    s = s.replace(/\\vspace\*?\{[^}]*\}/g, '');
    s = s.replace(/\\hspace\*?\{[^}]*\}/g, ' ');
    s = s.replace(/\\noindent\b/g, '');
    s = s.replace(/\\centering\b/g, '');
    s = s.replace(/\\hfill\b/g, '');
    s = s.replace(/\\dotfill\{?\}?/g, '……………………………………');

    // 10. Chuẩn hóa khoảng trắng
    s = s.replace(/[ \t]+/g, ' ');
    s = s.replace(/\n{3,}/g, '\n\n');

    return s.trim();
  }
}

// ================================================================
// Export cho trình duyệt (window) và Node.js (module)
// ================================================================
if (typeof window !== 'undefined') {
  window.TexParser = TexParser;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TexParser };
}
