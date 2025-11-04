import { useRef } from 'react'
import './ImageUpload.css'

function ImageUpload({ onUpload }) {
  const fileInputRef = useRef(null)

  const handleFileChange = (e) => {
    const files = e.target.files
    if (files && files.length > 0) {
      onUpload(files)
    }
  }

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="image-upload">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      <button onClick={handleClick} className="upload-button">
        Upload Images
      </button>
    </div>
  )
}

export default ImageUpload

