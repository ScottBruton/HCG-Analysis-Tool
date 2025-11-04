import { useState, useCallback, useEffect } from 'react'
import ImageCanvas from './components/ImageCanvas'
import ImageThumbnails from './components/ImageThumbnails'
import ImageUpload from './components/ImageUpload'
import ResultsTable from './components/ResultsTable'
import { processImage } from './utils/imageProcessing'
import './App.css'

function App() {
  const [images, setImages] = useState([])
  const [selectedImageIndex, setSelectedImageIndex] = useState(0)
  const [processing, setProcessing] = useState(false)
  const [results, setResults] = useState([])

  // Clear localStorage on app load
  useEffect(() => {
    const clearStorage = () => {
      const keys = Object.keys(localStorage)
      keys.forEach(key => {
        if (key.startsWith('hcg_image_')) {
          localStorage.removeItem(key)
        }
      })
    }
    clearStorage()
  }, [])

  const handleImageUpload = useCallback((files) => {
    // Clear localStorage when uploading new images
    const keys = Object.keys(localStorage)
    keys.forEach(key => {
      if (key.startsWith('hcg_image_')) {
        localStorage.removeItem(key)
      }
    })

    const newImages = Array.from(files).map((file, index) => ({
      id: Date.now() + index,
      file,
      url: URL.createObjectURL(file),
      roi: null,
      dpo: null,
      croppedImageUrl: null,
      rgb: null,
    }))
    setImages(newImages)
    setSelectedImageIndex(0)
  }, [])

  const handleROIUpdate = useCallback((index, roi, croppedImageUrl) => {
    setImages(prev => prev.map((img, i) => 
      i === index ? { ...img, roi, croppedImageUrl: croppedImageUrl || img.croppedImageUrl } : img
    ))
  }, [])

  const handleDPOUpdate = useCallback((index, dpo) => {
    setImages(prev => prev.map((img, i) => 
      i === index ? { ...img, dpo: dpo ? parseInt(dpo) : null } : img
    ))
  }, [])

  const handleResetROI = useCallback((index) => {
    setImages(prev => prev.map((img, i) => 
      i === index ? { ...img, roi: null, croppedImageUrl: null } : img
    ))
  }, [])

  const canStart = images.length > 0 && 
    images.every(img => img.croppedImageUrl !== null && img.dpo !== null)

  const handleStart = async () => {
    if (!canStart) return

    setProcessing(true)
    const sortedImages = [...images].sort((a, b) => a.dpo - b.dpo)
    
    const processedResults = []
    
    for (let i = 0; i < sortedImages.length; i++) {
      const image = sortedImages[i]
      // Use cropped image for analysis - process entire cropped image (no ROI needed)
      const rgb = await processImage(image.croppedImageUrl)
      
      image.rgb = rgb
      
      const rateOfChange = i > 0 
        ? rgb - processedResults[i - 1].rgb
        : 0
      
      processedResults.push({
        dpo: image.dpo,
        rgb,
        rateOfChange,
      })
    }

    // Update images with RGB values
    setImages(prev => prev.map(img => {
      const found = sortedImages.find(si => si.id === img.id)
      return found ? { ...img, rgb: found.rgb } : img
    }))

    setResults(processedResults)
    setProcessing(false)
  }

  const selectedImage = images[selectedImageIndex]

  return (
    <div className="app">
      <header className="app-header">
        <h1>HCG Measurement Tool</h1>
        <ImageUpload onUpload={handleImageUpload} />
      </header>

      {images.length > 0 && (
        <div className="app-content">
          <div className="main-panel">
            <ImageCanvas
              image={selectedImage}
              onROIUpdate={(roi, croppedImageUrl) => handleROIUpdate(selectedImageIndex, roi, croppedImageUrl)}
              onDPOUpdate={(dpo) => handleDPOUpdate(selectedImageIndex, dpo)}
              onResetROI={() => handleResetROI(selectedImageIndex)}
            />
            
            <ImageThumbnails
              images={images}
              selectedIndex={selectedImageIndex}
              onSelect={setSelectedImageIndex}
            />
          </div>

          <div className="controls">
            <button
              onClick={handleStart}
              disabled={!canStart || processing}
              className="start-button"
            >
              {processing ? 'Processing...' : 'Start Analysis'}
            </button>
          </div>

          {results.length > 0 && (
            <ResultsTable results={results} />
          )}
        </div>
      )}
    </div>
  )
}

export default App

