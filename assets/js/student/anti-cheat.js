/**
 * anti-cheat.js — Bảo mật phòng thi trực tuyến & Chống chụp màn hình
 * NoadD.Vo LMS & Exam System 3.0
 * 
 * Tính năng chính:
 * 1. Chặn tuyệt đối nhấp chuột phải (contextmenu).
 * 2. Chống chụp màn hình (PrintScreen, Win+Shift+S, Cmd+Shift+3/4, Snipping Tool blur).
 * 3. Chống in ấn (Ctrl+P, Save as PDF), chống sao chép nội dung câu hỏi.
 * 4. KHÔNG khóa bài hay tự nộp bài sau 5 lần — chỉ cảnh báo nhẹ nhàng để học sinh yên tâm làm bài.
 * 5. Tương thích hoàn toàn cả Mobile và Máy tính.
 */

const AntiCheat = (() => {
    let violations = 0;
    let log = [];
    let isActive = false;
    let blurTimer = null;
    let toastTimer = null;

    // ============================================================
    // KHỞI ĐỘNG HỆ THỐNG BẢO MẬT
    // ============================================================
    const start = (options = {}) => {
        violations = 0;
        log = [];
        isActive = true;

        // 1. Chặn chuột phải
        document.addEventListener('contextmenu', handleContextMenu, true);

        // 2. Chặn phím tắt chụp màn hình, in ấn, copy
        window.addEventListener('keydown', handleKeyDown, true);
        window.addEventListener('keyup', handleKeyUp, true);

        // 3. Chặn sự kiện copy, cut ngoài input/textarea
        document.addEventListener('copy', handleClipboardCopy, true);
        document.addEventListener('cut', handleClipboardCopy, true);

        // 4. Che nội dung khi mất focus (ngăn Snipping Tool, Win+Shift+S)
        window.addEventListener('blur', handleWindowBlur);
        window.addEventListener('focus', handleWindowFocus);

        // 5. Lắng nghe thay đổi visibility
        document.addEventListener('visibilitychange', handleVisibilityChange);

        console.log('[AntiCheat] Hệ thống bảo mật phòng thi đã kích hoạt (Không khóa bài, chống chụp màn hình)');
    };

    /**
     * Dừng bảo mật khi nộp bài
     */
    const stop = () => {
        isActive = false;
        document.removeEventListener('contextmenu', handleContextMenu, true);
        window.removeEventListener('keydown', handleKeyDown, true);
        window.removeEventListener('keyup', handleKeyUp, true);
        document.removeEventListener('copy', handleClipboardCopy, true);
        document.removeEventListener('cut', handleClipboardCopy, true);
        window.removeEventListener('blur', handleWindowBlur);
        window.removeEventListener('focus', handleWindowFocus);
        document.removeEventListener('visibilitychange', handleVisibilityChange);

        // Gỡ bỏ làm mờ nếu có
        removeBlurShield();
        console.log('[AntiCheat] Hệ thống bảo mật đã dừng');
    };

    // ============================================================
    // 1. CHẶN CHUỘT PHẢI (CONTEXT MENU)
    // ============================================================
    const handleContextMenu = (e) => {
        if (!isActive) return;

        // Cho phép chuột phải trong ô nhập liệu (nếu học sinh cần paste văn bản tự luận)
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        recordViolation('Nhấp chuột phải');
        showSecurityToast('🔒 Nhấp chuột phải đã bị khóa trong phòng thi!');
    };

    // ============================================================
    // 2. CHỐNG CHỤP MÀN HÌNH & PHÍM TẮT
    // ============================================================
    const handleKeyDown = (e) => {
        if (!isActive) return;

        const key = e.key ? e.key.toLowerCase() : '';
        const isCtrl = e.ctrlKey || e.metaKey;

        // A. Phím PrintScreen (PrtScn)
        if (e.key === 'PrintScreen' || e.keyCode === 44) {
            e.preventDefault();
            e.stopPropagation();
            clearClipboard();
            showCaptureShield('Đã chặn phím chụp màn hình (PrintScreen)!');
            recordViolation('Nhấn phím PrintScreen');
            return;
        }

        // B. Phím Win + Shift + S hoặc Cmd + Shift + 3/4/5
        if ((e.shiftKey && isCtrl && (key === 's' || key === '3' || key === '4' || key === '5')) ||
            (e.shiftKey && e.metaKey && (key === 's' || key === '3' || key === '4' || key === '5'))) {
            e.preventDefault();
            e.stopPropagation();
            clearClipboard();
            showCaptureShield('Đã chặn tổ hợp phím chụp màn hình!');
            recordViolation('Dùng phím tắt chụp màn hình');
            return;
        }

        // C. Chặn Ctrl + P (In ấn / Save as PDF)
        if (isCtrl && key === 'p') {
            e.preventDefault();
            e.stopPropagation();
            showSecurityToast('🔒 Chức năng in đề thi / Lưu PDF đã bị khóa!');
            recordViolation('Cố gắng in đề thi');
            return;
        }

        // D. Chặn Ctrl + S (Lưu trang web)
        if (isCtrl && key === 's') {
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        // E. Chặn Ctrl + U (Xem mã nguồn) & F12
        if ((isCtrl && key === 'u') || e.key === 'F12') {
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        // F. Chặn Ctrl + C ngoài input/textarea
        if (isCtrl && key === 'c') {
            const tag = document.activeElement ? document.activeElement.tagName : '';
            if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
                e.preventDefault();
                showSecurityToast('🔒 Sao chép nội dung câu hỏi đã bị khóa!');
            }
        }
    };

    const handleKeyUp = (e) => {
        if (!isActive) return;
        if (e.key === 'PrintScreen' || e.keyCode === 44) {
            clearClipboard();
            showCaptureShield('Đã chặn chụp màn hình!');
        }
    };

    // ============================================================
    // 3. CHẶN COPY CLIPBOARD & XÓA CLIPBOARD
    // ============================================================
    const handleClipboardCopy = (e) => {
        if (!isActive) return;
        const tag = document.activeElement ? document.activeElement.tagName : '';
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;

        e.preventDefault();
        if (e.clipboardData) {
            e.clipboardData.setData('text/plain', '');
        }
        showSecurityToast('🔒 Không được phép sao chép đề thi!');
    };

    const clearClipboard = () => {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText('').catch(() => {});
            }
        } catch (_) {}
    };

    // ============================================================
    // 4. LÀM MỜ KHI MẤT FOCUS (CHỐNG SNIPPING TOOL)
    // ============================================================
    const handleWindowBlur = () => {
        if (!isActive) return;
        // Khi mở Snipping Tool hoặc Win+Shift+S, cửa sổ bị mất focus
        clearClipboard();
        applyBlurShield();
    };

    const handleWindowFocus = () => {
        if (!isActive) return;
        // Trở lại cửa sổ thi: gỡ mờ sau 150ms
        setTimeout(() => {
            removeBlurShield();
        }, 150);
    };

    const handleVisibilityChange = () => {
        if (!isActive) return;
        if (document.hidden) {
            clearClipboard();
            applyBlurShield();
            recordViolation('Rời khỏi cửa sổ bài thi');
        } else {
            setTimeout(() => {
                removeBlurShield();
            }, 150);
        }
    };

    const applyBlurShield = () => {
        const container = document.getElementById('examPaperContainer');
        if (container && !container.classList.contains('privacy-blur')) {
            container.classList.add('privacy-blur');
        }
    };

    const removeBlurShield = () => {
        const container = document.getElementById('examPaperContainer');
        if (container) {
            container.classList.remove('privacy-blur');
        }
        const shield = document.getElementById('antiCaptureShield');
        if (shield) shield.remove();
    };

    /**
     * Hiển thị màn hình đen bảo mật khi phát hiện PrintScreen
     */
    const showCaptureShield = (message) => {
        let shield = document.getElementById('antiCaptureShield');
        if (!shield) {
            shield = document.createElement('div');
            shield.id = 'antiCaptureShield';
            shield.className = 'screen-shield-overlay';
            shield.innerHTML = `
                <div class="max-w-md p-6 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl text-center">
                    <div class="w-16 h-16 mx-auto mb-3 bg-rose-500/20 text-rose-400 rounded-full flex items-center justify-center text-3xl">
                        🔒
                    </div>
                    <h3 class="text-lg font-black text-white uppercase tracking-wider mb-2">Bảo Mật Bài Thi</h3>
                    <p class="text-sm text-slate-300 font-semibold mb-3">${message}</p>
                    <span class="inline-block px-3 py-1 bg-rose-500/30 text-rose-300 rounded-full text-xs font-bold">
                        Ảnh chụp màn hình đã bị chặn & xóa khỏi bộ nhớ đệm
                    </span>
                </div>
            `;
            document.body.appendChild(shield);
        }

        applyBlurShield();

        setTimeout(() => {
            removeBlurShield();
        }, 1200);
    };

    // ============================================================
    // 5. TOAST THÔNG BÁO NHẸ NHÀNG (KHÔNG LÀM PHIỀN/KHÓA BÀI)
    // ============================================================
    const showSecurityToast = (msg) => {
        let toast = document.getElementById('securityNoticeToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'securityNoticeToast';
            toast.className = 'fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-slate-900/90 text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-xl backdrop-blur-md border border-slate-700 flex items-center gap-2 pointer-events-none transition-all duration-200';
            document.body.appendChild(toast);
        }

        toast.textContent = msg;
        toast.style.opacity = '1';
        toast.style.transform = 'translate(-50%, 0)';

        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            if (toast) {
                toast.style.opacity = '0';
                toast.style.transform = 'translate(-50%, 15px)';
            }
        }, 2000);
    };

    // ============================================================
    // 6. GHI NHẬN VI PHẠM (CHỈ ĐỂ THỐNG KÊ, KHÔNG KHÓA BÀI)
    // ============================================================
    const recordViolation = (reason) => {
        violations++;
        const entry = {
            count: violations,
            reason,
            timestamp: new Date().toISOString(),
            timeFormatted: new Date().toLocaleTimeString('vi-VN'),
        };
        log.push(entry);
        console.warn(`[AntiCheat] Ghi nhận: ${reason} (Tổng: ${violations} lần - Không khóa bài)`);
    };

    const getIntegrity = () => {
        // Điểm đánh giá mức độ chuyên tâm (100% giảm nhẹ nếu chuyển tab, tối thiểu 70%)
        return Math.max(70, 100 - violations * 3);
    };

    return {
        start,
        stop,
        getViolations: () => violations,
        getLog: () => [...log],
        getIntegrity,
        recordViolation,
        showSecurityToast,
    };
})();

if (typeof window !== 'undefined') {
    window.AntiCheat = AntiCheat;
}
if (typeof module !== 'undefined') {
    module.exports = { AntiCheat };
}
