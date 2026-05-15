/**
 * Lazy-loaded export module imports.
 * These are dynamically imported to keep the initial bundle lean.
 */

/**
 * Dynamically import PDF export library (jsPDF).
 * Resolves when the module is needed, reducing initial bundle size.
 */
export async function lazyImportPdfExporter() {
  const pdfModule = await import(/* webpackChunkName: "export-pdf" */ 'jspdf')
  return pdfModule
}

/**
 * Dynamically import SVG paper library for complex SVG operations.
 */
export async function lazyImportPaper() {
  const paperModule = await import(/* webpackChunkName: "export-svg-paper" */ 'paper')
  return paperModule
}

/**
 * Dynamically import Canvas-based export dependencies.
 */
export async function lazyImportCanvasExporter() {
  // This is typically bundled with SVG operations
  // Return a marker that export functionality is ready
  return { ready: true }
}
