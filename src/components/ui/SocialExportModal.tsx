import { X, Download } from 'lucide-react'

type Props = {
  dataUrl: string
  onClose: () => void
}

export function SocialExportModal({ dataUrl, onClose }: Props) {
  function handleDownload() {
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `mygarage-share-${Date.now()}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <>
      <div className="social-modal-backdrop" onClick={onClose} />
      <div className="social-modal">
        <div className="social-modal-header">
          <span className="social-modal-title">📸 Share Preview</span>
          <button type="button" className="social-modal-close" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </div>

        <div className="social-modal-preview-wrap">
          <img className="social-modal-preview" src={dataUrl} alt="Share preview" />
        </div>

        <div className="social-modal-actions">
          <button type="button" className="social-download-btn" onClick={handleDownload}>
            <Download size={16} />
            Download PNG
          </button>
          <button type="button" className="social-cancel-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </>
  )
}
