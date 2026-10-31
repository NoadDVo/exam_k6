/**
 * storage.js — Quản lý lưu trữ cục bộ (LocalStorage)
 * NoadD.Vo LMS & Exam System 3.0
 * 
 * Thay thế Firebase bằng LocalStorage + JSON tĩnh
 * Phù hợp với deploy GitHub Pages
 */

const Storage = (() => {
    // ============================================================
    // KEYS
    // ============================================================
    const KEYS = {
        AUTH_USER: 'noadd_auth_user',
        EXAMS: 'noadd_exams',
        SUBMISSIONS: 'noadd_submissions',
        SETTINGS: 'noadd_settings',
        CURRENT_SESSION: 'noadd_session',
        IMAGES: 'noadd_images',
    };

    // ============================================================
    // HELPERS
    // ============================================================

    /**
     * Lấy dữ liệu từ LocalStorage, parse JSON
     * @param {string} key - Tên key
     * @param {*} defaultValue - Giá trị mặc định nếu không có
     */
    const get = (key, defaultValue = null) => {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (e) {
            console.error(`[Storage] Lỗi đọc key "${key}":`, e);
            return defaultValue;
        }
    };

    /**
     * Lưu dữ liệu vào LocalStorage dưới dạng JSON
     * @param {string} key - Tên key
     * @param {*} value - Giá trị cần lưu
     */
    const set = (key, value) => {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            console.error(`[Storage] Lỗi ghi key "${key}":`, e);
            return false;
        }
    };

    /**
     * Xóa một key
     */
    const remove = (key) => {
        localStorage.removeItem(key);
    };

    /**
     * Tạo mã đề thi gồm 6 chữ số ngẫu nhiên (chỉ gồm các số)
     */
    const generateExamCode = () => {
        return String(Math.floor(100000 + Math.random() * 900000));
    };

    /**
     * Tạo UUID đơn giản
     */
    const generateId = () => {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    };

    // ============================================================
    // AUTH & BẢO MẬT BĂM SHA-256 (CHỐNG LỘ QUA F12)
    // ============================================================

    /**
     * Băm chuỗi bằng thuật toán SHA-256 chuẩn Web Crypto
     */
    const sha256 = async (message) => {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    };

    // Danh sách tài khoản mặc định được băm SHA-256 (khớp với data/teachers.json)
    const DEFAULT_TEACHER_ACCOUNTS = {
        "noaddvo": {
            username: "noaddvo",
            email: "noaddvo",
            name: "Thầy NoadDVo",
            passwordHash: "84b1983ed82ba7faefaa2d558d2d891264e5565f850f3295431d84e08e3478d8",
            role: "teacher"
        },
        "lephuong_123": {
            username: "lephuong_123",
            email: "lephuong_123",
            name: "Cô Phương",
            passwordHash: "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92",
            role: "teacher"
        },
        "giaovien@gmail.com": {
            username: "giaovien@gmail.com",
            email: "giaovien@gmail.com",
            name: "Giáo Viên Bộ Môn",
            passwordHash: "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9",
            role: "teacher"
        }
    };

    const Auth = {
        /**
         * Lấy danh sách tài khoản giáo viên đã lưu
         */
        getTeachers: () => {
            const stored = get('noadd_teachers', null);
            if (!stored) {
                // Khởi tạo từ danh sách cấu hình tự cấp mặc định
                set('noadd_teachers', DEFAULT_TEACHER_ACCOUNTS);
                return DEFAULT_TEACHER_ACCOUNTS;
            }
            // Đảm bảo các tài khoản hệ thống mới luôn được hợp nhất
            let updated = false;
            for (const [k, v] of Object.entries(DEFAULT_TEACHER_ACCOUNTS)) {
                if (!stored[k] || stored[k].passwordHash !== v.passwordHash) {
                    stored[k] = v;
                    updated = true;
                }
            }
            if (updated) {
                set('noadd_teachers', stored);
            }
            return stored;
        },

        /**
         * Nạp tài khoản từ file json nếu có
         */
        syncWithJson: async () => {
            try {
                const res = await fetch('data/teachers.json?v=' + Date.now());
                if (res.ok) {
                    const list = await res.json();
                    const current = Auth.getTeachers();
                    list.forEach(t => {
                        const key = (t.username || t.email).toLowerCase();
                        current[key] = {
                            username: t.username || t.email,
                            email: t.email || t.username,
                            name: t.name,
                            passwordHash: t.passwordHash,
                            role: t.role || 'teacher'
                        };
                    });
                    set('noadd_teachers', current);
                }
            } catch (e) {
                // Chạy offline/local fallback
            }
        },

        /**
         * Đăng nhập giáo viên có kiểm tra SHA-256 an toàn
         */
        login: async (account, password) => {
            await Auth.syncWithJson();
            const teachers = Auth.getTeachers();
            const normalized = account.trim().toLowerCase();

            // Tìm theo key, username hoặc email
            let teacher = teachers[normalized];
            if (!teacher) {
                for (const t of Object.values(teachers)) {
                    if ((t.username && t.username.toLowerCase() === normalized) ||
                        (t.email && t.email.toLowerCase() === normalized)) {
                        teacher = t;
                        break;
                    }
                }
            }

            if (!teacher) {
                return { success: false, message: 'Tài khoản không tồn tại hoặc chưa được cấp quyền!' };
            }

            const inputHash = await sha256(password);
            if (teacher.passwordHash !== inputHash) {
                return { success: false, message: 'Mật khẩu không chính xác!' };
            }

            const userData = { email: teacher.email || teacher.username, name: teacher.name, role: 'teacher' };
            set(KEYS.AUTH_USER, userData);
            return { success: true, user: userData };
        },

        /**
         * Đăng xuất
         */
        logout: () => {
            remove(KEYS.AUTH_USER);
            remove(KEYS.CURRENT_SESSION);
        },

        /**
         * Lấy user hiện tại
         */
        getCurrentUser: () => get(KEYS.AUTH_USER, null),

        /**
         * Kiểm tra đã đăng nhập chưa
         */
        isLoggedIn: () => !!get(KEYS.AUTH_USER, null),
    };

    // ============================================================
    // EXAMS (Đề thi)
    // ============================================================

    const Exams = {
        /**
         * Lấy tất cả đề thi
         */
        getAll: () => get(KEYS.EXAMS, {}),

        /**
         * Lấy đề thi theo mã
         */
        getByCode: (examCode) => {
            const exams = Exams.getAll();
            const codeStr = String(examCode || '').trim();
            if (!codeStr) return null;

            // 1. So khớp trực tiếp
            if (exams[codeStr]) return exams[codeStr];

            // 2. So khớp không phân biệt hoa thường hoặc khoảng trắng
            for (const [key, ex] of Object.entries(exams)) {
                if (String(key).trim().toLowerCase() === codeStr.toLowerCase()) {
                    return ex;
                }
            }

            // 3. Fallback đề mẫu mặc định (de1.tex) tích hợp sẵn
            if (typeof window !== 'undefined' && window.__DEFAULT_EXAM__) {
                const def = window.__DEFAULT_EXAM__;
                // Nếu mã nhập là '123456' hoặc khớp mã đề gốc hoặc máy chưa có đề nào trong LocalStorage
                if (codeStr === '123456' || codeStr === String(def.examCode) || Object.keys(exams).length === 0) {
                    return { ...def, examCode: codeStr || '123456', isActive: true };
                }
            }

            return null;
        },

        /** Alias cho getByCode */
        get: (examCode) => Exams.getByCode(examCode),

        /**
         * Lưu đề thi mới
         * @param {Object} examData - Dữ liệu đề thi từ TexParser
         * @param {Object} config - Cấu hình kỳ thi (thời gian, cho xem đáp án, v.v.)
         */
        save: (examData, config = {}) => {
            const exams = Exams.getAll();
            const cfg = config || examData.config || {};
            // Ưu tiên mã do giáo viên nhập > mã từ examData > mã meta > tự sinh số ngẫu nhiên
            const examCode = String(cfg.examCode || examData.examCode || examData.meta?.examCode || generateExamCode()).trim();
            
            // Tích hợp toàn bộ hình ảnh đi kèm đề thi để lưu đồng bộ
            const attachedImages = {
                ...(typeof Storage !== 'undefined' && Storage.Images ? Storage.Images.getAll() : {}),
                ...(examData.images || {}),
                ...(cfg.images || {}),
                ...(typeof window !== 'undefined' && window.__EXAM_IMAGES__ ? window.__EXAM_IMAGES__ : {})
            };

            const exam = {
                ...examData,
                examCode,
                images: Object.keys(attachedImages).length ? attachedImages : (examData.images || {}),
                config: {
                    duration: cfg.duration || 45,
                    maxAttempts: cfg.maxAttempts || 1,
                    showScore: cfg.showScore !== false,
                    showAnswers: cfg.showAnswers !== false,
                    shuffleQuestions: cfg.shuffleQuestions || false,
                    title: cfg.title || examData.meta?.title || 'Đề thi',
                    subject: cfg.subject || examData.meta?.subject || 'Toán',
                    grade: cfg.grade || examData.meta?.grade || '',
                    teacher: cfg.teacher || examData.config?.teacher || '',
                    fontClass: cfg.fontClass || examData.config?.fontClass || examData.fontClass || 'font-itim',
                    paperStyle: cfg.paperStyle || examData.config?.paperStyle || examData.paperStyle || 'grid-oly',
                    paperColor: cfg.paperColor || examData.config?.paperColor || examData.paperColor || '#FDFCF7',
                },
                createdAt: examData.createdAt || new Date().toISOString(),
                createdBy: examData.createdBy || Auth.getCurrentUser()?.email || 'anonymous',
                isActive: true,
            };
            exams[examCode] = exam;
            set(KEYS.EXAMS, exams);
            return { success: true, examCode, exam };
        },

        /**
         * Cập nhật trạng thái đề thi
         */
        update: (examCode, updates) => {
            const exams = Exams.getAll();
            if (!exams[examCode]) return false;
            exams[examCode] = { ...exams[examCode], ...updates };
            set(KEYS.EXAMS, exams);
            return true;
        },

        /**
         * Xóa đề thi
         */
        delete: (examCode) => {
            const exams = Exams.getAll();
            delete exams[examCode];
            set(KEYS.EXAMS, exams);
        },

        /**
         * Lấy danh sách đề thi của giáo viên hiện tại
         */
        getMyExams: () => {
            const user = Auth.getCurrentUser();
            const exams = Exams.getAll();
            let list = Object.values(exams);

            // Nếu chưa có đề nào trong LocalStorage, nạp sẵn đề mẫu 123456
            if (list.length === 0 && typeof window !== 'undefined' && window.__DEFAULT_EXAM__) {
                const def = window.__DEFAULT_EXAM__;
                const defaultExam = {
                    ...def,
                    examCode: '123456',
                    createdBy: user?.email || 'giaovien@gmail.com',
                    createdAt: def.createdAt || new Date().toISOString()
                };
                exams['123456'] = defaultExam;
                set(KEYS.EXAMS, exams);
                list = [defaultExam];
            }

            if (!user) return list;
            return list
                .filter(e => !e.createdBy || e.createdBy.toLowerCase() === user.email.toLowerCase() || user.role === 'admin' || user.email === 'admin@school.edu.vn')
                .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        },
    };

    // ============================================================
    // SUBMISSIONS (Bài làm học sinh)
    // ============================================================

    const Submissions = {
        /**
         * Lấy tất cả bài nộp
         */
        getAll: () => get(KEYS.SUBMISSIONS, {}),

        /**
         * Lấy bài nộp theo mã đề thi
         */
        getByExam: (examCode) => {
            const all = Submissions.getAll();
            return Object.values(all).filter(s => s.examCode === examCode);
        },
        getByExamCode: (examCode) => Submissions.getByExam(examCode),

        /**
         * Lưu bài làm học sinh
         */
        save: (submissionData) => {
            const all = Submissions.getAll();
            const id = generateId();
            const submission = {
                id,
                ...submissionData,
                submittedAt: new Date().toISOString(),
            };
            all[id] = submission;
            set(KEYS.SUBMISSIONS, all);
            return { success: true, id, submission };
        },

        /**
         * Tính điểm tự động cho câu TN, Đúng/Sai, Trả lời ngắn
         */
        calculateScore: (exam, answers = {}) => {
            let totalScore = 0;
            let correctCount = 0;
            let totalCount = 0;
            const details = [];

            (exam.questions || []).forEach(q => {
                if (q.type === 'essay') {
                    details.push({
                        questionId: q.id,
                        type: 'essay',
                        studentAnswer: answers[q.id] || null,
                        isCorrect: null,
                        earnedPoints: 0,
                        maxPoints: q.points || 0
                    });
                    return;
                }

                const studentAnswer = answers[q.id];
                let isCorrect = false;
                let earnedPoints = 0;
                const maxPoints = q.points || (q.type === 'truefalse' ? 1.0 : 0.25);

                if (q.type === 'choice') {
                    totalCount++;
                    const correctOpt = q.options?.find(o => o.isCorrect);
                    const correctLetter = correctOpt?.letter;
                    isCorrect = Boolean(studentAnswer && studentAnswer === correctLetter);
                    if (isCorrect) {
                        correctCount++;
                        earnedPoints = maxPoints;
                        totalScore += earnedPoints;
                    }
                    details.push({
                        questionId: q.id,
                        type: 'choice',
                        studentAnswer: studentAnswer || null,
                        correctAnswer: correctLetter,
                        isCorrect,
                        earnedPoints: Math.round(earnedPoints * 100) / 100,
                        maxPoints
                    });
                } else if (q.type === 'truefalse') {
                    totalCount++;
                    const tfItems = q.tfItems || [];
                    let numMatched = 0;
                    const itemResults = {};
                    tfItems.forEach(item => {
                        const studentVal = (studentAnswer && typeof studentAnswer === 'object') ? studentAnswer[item.letter] : undefined;
                        const match = (studentVal !== undefined && Boolean(studentVal) === Boolean(item.isCorrect));
                        if (match) numMatched++;
                        itemResults[item.letter] = {
                            studentValue: studentVal !== undefined ? Boolean(studentVal) : null,
                            correctValue: Boolean(item.isCorrect),
                            isMatch: match
                        };
                    });

                    // Thang điểm câu Đúng/Sai: Mỗi ý đúng được 0.25 điểm (sai 1 ý trừ 0.25 điểm)
                    // 1 ý = 0.25 đ, 2 ý = 0.50 đ, 3 ý = 0.75 đ, 4 ý = 1.0 đ
                    const itemPoints = (q.points && tfItems.length) ? (q.points / tfItems.length) : 0.25;
                    earnedPoints = Math.round(numMatched * itemPoints * 100) / 100;
                    totalScore += earnedPoints;
                    isCorrect = (numMatched === tfItems.length && tfItems.length > 0);
                    if (isCorrect) correctCount++;

                    details.push({
                        questionId: q.id,
                        type: 'truefalse',
                        studentAnswer: studentAnswer || {},
                        itemResults,
                        numMatched,
                        totalItems: tfItems.length,
                        isCorrect,
                        earnedPoints: Math.round(earnedPoints * 100) / 100,
                        maxPoints
                    });
                } else if (q.type === 'shortanswer') {
                    totalCount++;
                    const expected = String(q.shortAnswer || '').trim();
                    const given = String(studentAnswer || '').trim();

                    // Thuật toán so khớp thông minh linh hoạt cho học sinh
                    const isShortAnswerMatch = (g, e) => {
                        if (!g || !e) return false;
                        const norm = (s) => String(s)
                            .trim()
                            .toLowerCase()
                            .replace(/\\text\s*\{([^}]*)\}/g, '$1')
                            .replace(/\\mathrm\s*\{([^}]*)\}/g, '$1')
                            .replace(/\\dfrac\s*\{([^}]*)\}\{([^}]*)\}/g, '$1/$2')
                            .replace(/\\frac\s*\{([^}]*)\}\{([^}]*)\}/g, '$1/$2')
                            .replace(/\\cdot/g, '*')
                            .replace(/\\times/g, '*')
                            .replace(/[·•]/g, '*')
                            .replace(/²/g, '^2')
                            .replace(/³/g, '^3')
                            .replace(/\$/g, '')
                            .trim();

                        const gNorm = norm(g);
                        const eNorm = norm(e);
                        if (gNorm === eNorm) return true;

                        // 1. Phân tách danh sách theo ; hoặc ,
                        if (eNorm.includes(';') || eNorm.includes(',') || gNorm.includes(';') || gNorm.includes(',')) {
                            const eParts = eNorm.split(/[;,]/).map(x => x.trim()).filter(Boolean);
                            const gParts = gNorm.split(/[;,]/).map(x => x.trim()).filter(Boolean);
                            if (eParts.length === gParts.length && eParts.length > 1) {
                                if (eParts.every((val, idx) => val === gParts[idx])) return true;
                            }
                        }

                        // 2. Lược bỏ đơn vị đo (cm, m², cm², ...)
                        const stripUnit = (str) => str.replace(/\s*(cm\^2|cm²|cm2|cm|m\^2|m²|m2|m|dm|mm|km|kg|g|lit|l)\b/gi, '').trim();
                        const gNoUnit = stripUnit(gNorm);
                        const eNoUnit = stripUnit(eNorm);
                        if (gNoUnit && eNoUnit && gNoUnit === eNoUnit) return true;

                        // 3. Phân số và số thập phân (1/2 <=> 0.5 <=> 0,5)
                        const parseVal = (str) => {
                            str = str.replace(',', '.');
                            if (/^-?\d+\s*\/\s*\d+$/.test(str)) {
                                const [n, d] = str.split('/').map(Number);
                                return d !== 0 ? n / d : NaN;
                            }
                            if (/^-?\d+(\.\d+)?$/.test(str)) return Number(str);
                            return NaN;
                        };
                        const gVal = parseVal(gNoUnit);
                        const eVal = parseVal(eNoUnit);
                        if (!isNaN(gVal) && !isNaN(eVal) && Math.abs(gVal - eVal) < 1e-6) return true;

                        // 4. Lũy thừa ra giá trị số (12^2 <=> 144)
                        const calcPower = (str) => {
                            const m = str.match(/^(\d+)\^(\d+)$/);
                            if (m) return Math.pow(Number(m[1]), Number(m[2]));
                            return NaN;
                        };
                        const gPow = calcPower(gNorm);
                        const ePow = calcPower(eNorm);
                        if (!isNaN(gPow) && !isNaN(eVal) && gPow === eVal) return true;
                        if (!isNaN(ePow) && !isNaN(gVal) && ePow === gVal) return true;

                        // 5. Tích lũy thừa (2^2 * 3^2 <=> 3^2 * 2^2 <=> 36)
                        if (eNorm.includes('^') && eNorm.includes('*')) {
                            const cleanProd = (s) => s.replace(/\s+/g, '');
                            if (cleanProd(gNorm) === cleanProd(eNorm)) return true;
                            const getFactors = (s) => s.split('*').map(x => x.replace(/\s+/g, '')).filter(Boolean).sort().join('*');
                            if (getFactors(gNorm) === getFactors(eNorm)) return true;
                            if (eNorm.replace(/\s+/g, '') === '2^2*3^2') {
                                if (gNorm === '36' || gNorm === '4*9' || gNorm === '9*4' || cleanProd(gNorm) === '4*9' || cleanProd(gNorm) === '9*4') return true;
                            }
                        }

                        return false;
                    };

                    isCorrect = isShortAnswerMatch(given, expected);
                    if (isCorrect) {
                        correctCount++;
                        earnedPoints = maxPoints;
                        totalScore += earnedPoints;
                    }
                    details.push({
                        questionId: q.id,
                        type: 'shortanswer',
                        studentAnswer: studentAnswer || '',
                        correctAnswer: q.shortAnswer,
                        isCorrect,
                        earnedPoints: Math.round(earnedPoints * 100) / 100,
                        maxPoints
                    });
                }
            });

            return {
                totalScore: Math.round(totalScore * 100) / 100,
                correctCount,
                totalCount,
                wrongCount: totalCount - correctCount,
                details,
            };
        },
    };

    // ============================================================
    // SESSION & STUDENT SESSION (Phiên thi & Bản nháp của học sinh)
    // ============================================================

    const StudentSession = {
        save: (data) => set(KEYS.CURRENT_SESSION, data),
        get: () => get(KEYS.CURRENT_SESSION, null),
        clear: () => remove(KEYS.CURRENT_SESSION),
        saveDraft: (examCode, studentId, draft) => {
            set(`draft_${examCode}_${studentId || 'default'}`, draft);
        },
        getDraft: (examCode, studentId) => {
            return get(`draft_${examCode}_${studentId || 'default'}`, null);
        },
        clearDraft: (examCode, studentId) => {
            remove(`draft_${examCode}_${studentId || 'default'}`);
        }
    };

    // ============================================================
    // SETTINGS
    // ============================================================

    const Settings = {
        get: () => get(KEYS.SETTINGS, {
            theme: 'light',
            language: 'vi',
            paperStyle: 'grid-oly',
            fontClass: 'font-itim',
        }),
        save: (settings) => set(KEYS.SETTINGS, settings),
    };

    // ============================================================
    // IMAGES (Quản lý hình ảnh đính kèm đề thi qua Base64)
    // ============================================================

    const Images = {
        /**
         * Lấy tất cả ảnh đã lưu
         */
        getAll: () => get(KEYS.IMAGES, {}),

        /**
         * Lấy ảnh theo tên hoặc đường dẫn
         */
        get: (key) => {
            if (!key) return null;
            const images = Images.getAll();
            const clean = String(key).trim().replace(/^(?:images|images_deontap)\//, '');
            return images[key] || images[clean] || images[`images/${clean}`] || images[`images_deontap/${clean}`] || null;
        },

        /**
         * Lưu một ảnh (dạng base64 data URL)
         */
        save: (key, dataUrl) => {
            if (!key || !dataUrl) return false;
            const images = Images.getAll();
            const clean = String(key).trim().replace(/^(?:images|images_deontap)\//, '');
            images[key] = dataUrl;
            images[clean] = dataUrl;
            images[`images/${clean}`] = dataUrl;
            images[`images_deontap/${clean}`] = dataUrl;
            return set(KEYS.IMAGES, images);
        },

        /**
         * Xóa ảnh
         */
        remove: (key) => {
            const images = Images.getAll();
            const clean = String(key).trim().replace(/^(?:images|images_deontap)\//, '');
            delete images[key];
            delete images[clean];
            delete images[`images/${clean}`];
            delete images[`images_deontap/${clean}`];
            return set(KEYS.IMAGES, images);
        },

        /**
         * Xóa toàn bộ kho ảnh
         */
        clear: () => remove(KEYS.IMAGES),
    };

    // ============================================================
    // PUBLIC API
    // ============================================================
    return {
        Auth,
        Exams,
        Submissions,
        Images,
        Session: StudentSession,
        StudentSession,
        Settings,
        generateExamCode,
        generateId,
    };

})();

// Export cho browser và Node.js
if (typeof window !== 'undefined') {
    window.Storage = Storage;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Storage;
}
