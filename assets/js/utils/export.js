/**
 * export.js — Xuất dữ liệu ra PDF, Excel, PNG
 * NoadD.Vo LMS & Exam System 3.0
 */

const Exporter = (() => {

    // ============================================================
    // EXCEL EXPORT (dùng SheetJS)
    // ============================================================

    /**
     * Xuất kết quả thi ra file Excel
     * @param {Array} submissions - Danh sách bài nộp
     * @param {string} examTitle - Tên đề thi
     */
    const exportToExcel = (submissions, examTitle = 'Ket qua thi') => {
        if (typeof XLSX === 'undefined') {
            alert('Thư viện SheetJS chưa được tải!');
            return;
        }

        const rows = submissions.map((s, idx) => ({
            'STT': idx + 1,
            'Họ và tên': s.studentName || '',
            'Lớp': s.studentClass || '',
            'Mã học sinh': s.studentId || '',
            'Điểm': s.score ?? '',
            'Đúng TN (câu)': s.correctCount ?? '',
            'Tổng TN (câu)': s.totalCount ?? '',
            'Độ tin cậy (%)': s.integrity ?? 100,
            'Vi phạm quy chế': s.violations ?? 0,
            'Thời gian nộp': s.submittedAt ? new Date(s.submittedAt).toLocaleString('vi-VN') : '',
        }));

        const ws = XLSX.utils.json_to_sheet(rows);

        // Độ rộng cột
        ws['!cols'] = [
            { wch: 5 }, { wch: 25 }, { wch: 10 }, { wch: 15 },
            { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
            { wch: 16 }, { wch: 20 },
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Kết quả');

        // Sheet tóm tắt thống kê
        const scores = submissions.map(s => s.score).filter(s => s != null);
        const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : 0;
        const max = scores.length ? Math.max(...scores) : 0;
        const min = scores.length ? Math.min(...scores) : 0;
        const pass = scores.filter(s => s >= 5).length;

        const summaryRows = [
            { 'Chỉ số': 'Tổng số bài nộp', 'Giá trị': submissions.length },
            { 'Chỉ số': 'Điểm trung bình', 'Giá trị': avg },
            { 'Chỉ số': 'Điểm cao nhất', 'Giá trị': max },
            { 'Chỉ số': 'Điểm thấp nhất', 'Giá trị': min },
            { 'Chỉ số': 'Số đạt (≥5đ)', 'Giá trị': pass },
            { 'Chỉ số': 'Tỉ lệ đạt', 'Giá trị': submissions.length ? `${((pass / submissions.length) * 100).toFixed(1)}%` : '0%' },
        ];

        const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
        XLSX.utils.book_append_sheet(wb, wsSummary, 'Thống kê');

        // Tải file
        const fileName = `${examTitle.replace(/[^a-zA-Z0-9À-ỹ ]/g, '_')}_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };

    // ============================================================
    // PDF / PRINT
    // ============================================================

    /**
     * In trang hiện tại (dùng browser print)
     * @param {string} containerId - ID của vùng cần in
     */
    const printSection = (containerId) => {
        const content = document.getElementById(containerId);
        if (!content) return;

        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html lang="vi">
            <head>
                <meta charset="UTF-8">
                <title>In đề thi</title>
                <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
                <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
                <style>
                    body { font-family: 'Plus Jakarta Sans', sans-serif; margin: 0; padding: 20px; }
                    @media print { body { margin: 0; } }
                    .solution-box { display: none !important; }
                    .choice-item.correct { background: transparent !important; border-color: transparent !important; }
                </style>
            </head>
            <body>
                ${content.innerHTML}
            </body>
            </html>
        `);
        printWindow.document.close();
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 800);
    };

    // ============================================================
    // PNG EXPORT (dùng html2canvas)
    // ============================================================

    /**
     * Xuất phần tử DOM thành ảnh PNG
     * @param {HTMLElement} element - Phần tử cần chụp
     * @param {string} filename - Tên file xuất
     */
    const exportToPng = async (element, filename = 'de-thi') => {
        if (typeof html2canvas === 'undefined') {
            alert('Thư viện html2canvas chưa được tải!');
            return;
        }
        try {
            showToast('Đang tạo ảnh...', 'info');
            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff',
            });
            const link = document.createElement('a');
            link.download = `${filename}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            showToast('Đã xuất ảnh thành công!', 'success');
        } catch (e) {
            console.error('[Export] Lỗi xuất PNG:', e);
            showToast('Có lỗi khi xuất ảnh!', 'error');
        }
    };

    /**
     * Helper: hiển thị toast notification
     */
    const showToast = (msg, type = 'info') => {
        if (typeof Toast !== 'undefined') {
            Toast.show(msg, type);
        } else {
            console.log(`[Toast] ${type}: ${msg}`);
        }
    };

    return { exportToExcel, printSection, exportToPng };
})();

window.Exporter = Exporter;
