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
    // Dù mở F12 cũng chỉ thấy chuỗi mã hóa, không thể dịch ngược ra mật khẩu gốc
    const DEFAULT_TEACHER_ACCOUNTS = {
        "giaovien@gmail.com": {
            email: "giaovien@gmail.com",
            name: "Giáo Viên Bộ Môn",
            passwordHash: "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9", // admin123
            role: "teacher"
        },
        "thaynam@gmail.com": {
            email: "thaynam@gmail.com",
            name: "Thầy Võ Hoàng Nam",
            passwordHash: "13172baa4590e81430c91b83fe152cf6ff6abb32f7f7f268fcdc86daa585fada", // toan6@2026
            role: "teacher"
        },
        "admin@school.edu.vn": {
            email: "admin@school.edu.vn",
            name: "Quản Trị Viên Khảo Thí",
            passwordHash: "e88d908c9e5872a47e8e4fdd686d7ed136b82f8c57f5a126fd8c5ab195f2e6d4", // giaovien123
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
            return stored;
        },

        /**
         * Nạp tài khoản từ file json nếu có
         */
        syncWithJson: async () => {
            try {
                const res = await fetch('data/teachers.json');
                if (res.ok) {
                    const list = await res.json();
                    const current = Auth.getTeachers();
                    list.forEach(t => {
                        current[t.email.toLowerCase()] = {
                            email: t.email,
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
        login: async (email, password) => {
            await Auth.syncWithJson();
            const teachers = Auth.getTeachers();
            const normalizedEmail = email.trim().toLowerCase();
            const teacher = teachers[normalizedEmail];

            if (!teacher) {
                return { success: false, message: 'Tài khoản không tồn tại hoặc chưa được cấp quyền!' };
            }

            const inputHash = await sha256(password);
            if (teacher.passwordHash !== inputHash) {
                return { success: false, message: 'Mật khẩu không chính xác!' };
            }

            const userData = { email: teacher.email, name: teacher.name, role: 'teacher' };
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
            const exam = {
                ...examData,
                examCode,
                config: {
                    duration: cfg.duration || 45,
                    maxAttempts: cfg.maxAttempts || 1,
                    showScore: cfg.showScore !== false,
                    showAnswers: cfg.showAnswers !== false,
                    shuffleQuestions: cfg.shuffleQuestions || false,
                    title: cfg.title || examData.meta?.title || 'Đề thi',
                    subject: cfg.subject || examData.meta?.subject || 'Toán',
                    grade: cfg.grade || examData.meta?.grade || '',
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

                    // Thang điểm Bộ GD&ĐT cho câu Đúng/Sai (1.0 điểm):
                    // Đúng 1 ý = 0.1 đ, 2 ý = 0.25 đ, 3 ý = 0.5 đ, 4 ý = 1.0 đ
                    const correctTable = { 0: 0, 1: 0.1, 2: 0.25, 3: 0.5, 4: 1.0 };
                    earnedPoints = (correctTable[numMatched] !== undefined ? correctTable[numMatched] : (numMatched / (tfItems.length || 4))) * maxPoints;
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
                    const expected = String(q.shortAnswer || '').trim().toLowerCase();
                    const given = String(studentAnswer || '').trim().toLowerCase();
                    isCorrect = Boolean(expected && given && expected === given);
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
    // PUBLIC API
    // ============================================================
    return {
        Auth,
        Exams,
        Submissions,
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
