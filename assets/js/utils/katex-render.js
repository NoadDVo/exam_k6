/**
 * katex-render.js — Tự động render toán LaTeX với KaTeX
 * NoadD.Vo LMS & Exam System 3.0
 */

const KatexRenderer = (() => {

    /**
     * Render tất cả biểu thức toán trong một phần tử DOM
     * @param {HTMLElement} container - Phần tử cần render
     */
    const renderAll = (container = document.body) => {
        if (typeof renderMathInElement === 'undefined') {
            console.warn('[KaTeX] renderMathInElement chưa được tải!');
            return;
        }
        renderMathInElement(container, {
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '$', right: '$', display: false },
                { left: '\\[', right: '\\]', display: true },
                { left: '\\(', right: '\\)', display: false },
                { left: '\\begin{align}', right: '\\end{align}', display: true },
                { left: '\\begin{align*}', right: '\\end{align*}', display: true },
                { left: '\\begin{equation}', right: '\\end{equation}', display: true },
            ],
            throwOnError: false,
            errorColor: '#ef4444',
            trust: true,
            strict: false,
            macros: {
                // Macro tiếng Việt phổ biến trong toán
                '\\dvdots': '\\vdots',
                '\\R': '\\mathbb{R}',
                '\\N': '\\mathbb{N}',
                '\\Z': '\\mathbb{Z}',
                '\\Q': '\\mathbb{Q}',
                '\\C': '\\mathbb{C}',
                // Ký hiệu chia hết
                '\\divides': '\\mid',
                // Tập hợp
                '\\UC': '\\text{ƯC}',
                '\\BC': '\\text{BC}',
                '\\UCLN': '\\text{ƯCLN}',
                '\\BCNN': '\\text{BCNN}',
            }
        });
    };

    /**
     * Render một string toán học thành HTML inline
     * @param {string} latex - Biểu thức LaTeX
     * @param {boolean} display - Dạng display (block) hay inline
     */
    const renderString = (latex, display = false) => {
        if (typeof katex === 'undefined') return latex;
        try {
            return katex.renderToString(latex, {
                throwOnError: false,
                displayMode: display,
                trust: true,
                strict: false,
            });
        } catch (e) {
            console.warn('[KaTeX] Lỗi render:', latex, e);
            return `<span class="katex-error">${latex}</span>`;
        }
    };

    return { renderAll, renderString };
})();

window.KatexRenderer = KatexRenderer;
