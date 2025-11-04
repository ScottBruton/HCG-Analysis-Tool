import './ImageThumbnails.css'

function ImageThumbnails({ images, selectedIndex, onSelect }) {
  if (images.length === 0) return null

  return (
    <div className="thumbnails-container">
      <h3>Images ({images.length})</h3>
      <div className="thumbnails-grid">
        {images.map((image, index) => (
          <div
            key={image.id}
            className={`thumbnail ${index === selectedIndex ? 'selected' : ''} ${!image.croppedImageUrl || !image.dpo ? 'incomplete' : ''}`}
            onClick={() => onSelect(index)}
          >
            <img src={image.croppedImageUrl || image.url} alt={`Image ${index + 1}`} />
            <div className="thumbnail-info">
              <div className="thumbnail-label">Image {index + 1}</div>
              {image.dpo !== null && (
                <div className="thumbnail-dpo">DPO: {image.dpo}</div>
              )}
              {image.rgb && (
                <div className="thumbnail-rgb">
                  RGB: ({image.rgb.r.toFixed(0)}, {image.rgb.g.toFixed(0)}, {image.rgb.b.toFixed(0)})
                </div>
              )}
              <div className="thumbnail-status">
                {image.croppedImageUrl && image.dpo !== null ? '✓ Ready' : '⚠ Incomplete'}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default ImageThumbnails

