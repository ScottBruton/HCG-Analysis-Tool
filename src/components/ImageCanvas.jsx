import { useState, useRef, useEffect } from 'react'
import './ImageCanvas.css'

function ImageCanvas({ image, onROIUpdate, onDPOUpdate, onResetROI }) {
  const canvasRef = useRef(null)
  const overlayCanvasRef = useRef(null)
  const containerRef = useRef(null)
  const imageRef = useRef(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [mode, setMode] = useState('paint') // 'paint' or 'erase'
  const [brushSize, setBrushSize] = useState(10)
  const [paintedPixels, setPaintedPixels] = useState(new Set()) // Track painted pixels
  const [history, setHistory] = useState([]) // For undo
  const [dpo, setDPO] = useState(image?.dpo?.toString() || '')
  const lastImageIdRef = useRef(null)
  const savedROIRef = useRef(null) // Store saved ROI for restoration after canvas is drawn

  useEffect(() => {
    if (image && image.id !== lastImageIdRef.current) {
      // Only load when image actually changes (different ID)
      lastImageIdRef.current = image.id
      
      // Clear painted pixels when switching images
      setPaintedPixels(new Set())
      savedROIRef.current = null
      
      // Restore DPO if exists
      setDPO(image.dpo?.toString() || '')
      
      // Restore painted pixels if ROI exists and no cropped image yet
      if (image.roi && image.roi.paintedPixels && !image.croppedImageUrl) {
        savedROIRef.current = image.roi
      }
      
      setHistory([])
      // Wait for container to be rendered and sized
      setTimeout(() => {
        drawImage()
      }, 0)
    }
  }, [image])

  useEffect(() => {
    // Handle window resize
    const handleResize = () => {
      if (image && imageRef.current) {
        drawImage()
      }
    }
    
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [image])

  useEffect(() => {
    redrawOverlay()
  }, [paintedPixels])

  const drawImage = () => {
    const canvas = canvasRef.current
    const overlayCanvas = overlayCanvasRef.current
    const container = containerRef.current
    if (!canvas || !overlayCanvas || !image || !container) return

    // Check if container has width
    const containerWidth = container.clientWidth
    if (containerWidth === 0) {
      // Container not sized yet, try again
      setTimeout(() => drawImage(), 100)
      return
    }

    const ctx = canvas.getContext('2d')
    const overlayCtx = overlayCanvas.getContext('2d')
    const img = new Image()
    
    img.onload = () => {
      imageRef.current = img
      const scaleX = containerWidth / img.width
      const canvasHeight = img.height * scaleX
      
      // Set canvas internal resolution (for drawing)
      canvas.width = containerWidth
      canvas.height = canvasHeight
      overlayCanvas.width = containerWidth
      overlayCanvas.height = canvasHeight
      
      // Set explicit CSS dimensions to stretch canvas to image size
      canvas.style.width = `${containerWidth}px`
      canvas.style.height = `${canvasHeight}px`
      overlayCanvas.style.width = `${containerWidth}px`
      overlayCanvas.style.height = `${canvasHeight}px`
      
      // Update container height to match image aspect ratio
      container.style.height = `${canvasHeight}px`
      container.style.width = `${containerWidth}px`
      
      // Draw the image (cropped if exists, otherwise original)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      
      // Clear overlay canvas first
      overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)
      
      // Only show overlay if we have ROI but no cropped image yet (still in drawing mode)
      if (!image.croppedImageUrl && savedROIRef.current && savedROIRef.current.paintedPixels && image.id === lastImageIdRef.current) {
        const savedROI = savedROIRef.current
        
        if (savedROI.canvasWidth && savedROI.canvasHeight) {
          // Scale painted pixels to current canvas size
          const scaleX_pixels = canvas.width / savedROI.canvasWidth
          const scaleY_pixels = canvas.height / savedROI.canvasHeight
          
          const scaledPixels = new Set()
          savedROI.paintedPixels.forEach(pixelKey => {
            const [x, y] = pixelKey.split(',').map(Number)
            const newX = Math.round(x * scaleX_pixels)
            const newY = Math.round(y * scaleY_pixels)
            if (newX >= 0 && newX < canvas.width && newY >= 0 && newY < canvas.height) {
              scaledPixels.add(`${newX},${newY}`)
            }
          })
          setPaintedPixels(scaledPixels)
        } else {
          setPaintedPixels(new Set(savedROI.paintedPixels))
        }
      }
    }
    
    img.onerror = () => {
      console.error('Failed to load image:', image.url)
    }
    
    // Load the image - cropped if exists, otherwise original
    img.src = image.croppedImageUrl || image.url
  }

  const redrawOverlay = () => {
    const overlayCanvas = overlayCanvasRef.current
    if (!overlayCanvas) return
    
    const ctx = overlayCanvas.getContext('2d')
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)
    ctx.fillStyle = 'rgba(0, 255, 0, 0.3)' // Transparent green
    
    paintedPixels.forEach(pixelKey => {
      const [x, y] = pixelKey.split(',').map(Number)
      ctx.fillRect(x, y, 1, 1)
    })
  }

  const paintPixel = (x, y, isErasing = false) => {
    const overlayCanvas = overlayCanvasRef.current
    if (!overlayCanvas) return
    
    // Create a new Set to avoid mutating state
    const newPaintedPixels = new Set(paintedPixels)
    const ctx = overlayCanvas.getContext('2d')
    const radius = brushSize / 2
    
    // Paint/erase in a circle
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const px = Math.round(x + dx)
        const py = Math.round(y + dy)
        
        // Check if within circle
        if (dx * dx + dy * dy <= radius * radius) {
          const pixelKey = `${px},${py}`
          
          if (isErasing) {
            // Erase: remove from painted pixels
            newPaintedPixels.delete(pixelKey)
          } else {
            // Paint: only add if not already painted (maintain transparency)
            if (!newPaintedPixels.has(pixelKey) && px >= 0 && py >= 0 && 
                px < overlayCanvas.width && py < overlayCanvas.height) {
              newPaintedPixels.add(pixelKey)
            }
          }
        }
      }
    }
    
    // Update state with new Set
    setPaintedPixels(newPaintedPixels)
  }

  const getMousePos = (e) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    }
  }

  const handleMouseDown = (e) => {
    if (!image) return
    setIsDrawing(true)
    const pos = getMousePos(e)
    
    // Save current state for undo (only once per mouse down)
    setHistory(prev => [...prev, new Set(paintedPixels)])
    
    paintPixel(pos.x, pos.y, mode === 'erase')
  }

  const handleMouseMove = (e) => {
    if (!isDrawing) return
    
    const pos = getMousePos(e)
    paintPixel(pos.x, pos.y, mode === 'erase')
  }

  const handleMouseUp = () => {
    if (isDrawing) {
      setIsDrawing(false)
    }
  }

  const handleDPOChange = (e) => {
    const value = e.target.value
    setDPO(value)
    onDPOUpdate(value)
    // Save DPO to localStorage
    if (image) {
      saveImageData(image.id, { dpo: value ? parseInt(value) : null })
    }
  }

  const handleClearROI = () => {
    setHistory(prev => [...prev, new Set(paintedPixels)])
    setPaintedPixels(new Set())
    redrawOverlay()
  }

  const handleUndo = () => {
    if (history.length > 0) {
      const prevState = history[history.length - 1]
      setHistory(prev => prev.slice(0, -1))
      setPaintedPixels(new Set(prevState))
      redrawOverlay()
    }
  }

  const handleSaveROI = () => {
    if (paintedPixels.size === 0 || !imageRef.current) return
    
    const canvas = canvasRef.current
    if (!canvas) return
    
    // Calculate bounding box of painted region (overlay coordinates)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    
    paintedPixels.forEach(pixelKey => {
      const [x, y] = pixelKey.split(',').map(Number)
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    })
    
    if (minX === Infinity) return
    
    // Scale ROI coordinates back to original image dimensions
    const scaleX = imageRef.current.width / canvas.width
    const scaleY = imageRef.current.height / canvas.height
    
    const scaledROI = {
      x: minX * scaleX,
      y: minY * scaleY,
      width: (maxX - minX) * scaleX,
      height: (maxY - minY) * scaleY,
      canvasX: minX,
      canvasY: minY,
      canvasWidth: maxX - minX,
      canvasHeight: maxY - minY,
      paintedPixels: Array.from(paintedPixels)
    }
    
    // Crop the image to the ROI region
    const cropCanvas = document.createElement('canvas')
    const cropCtx = cropCanvas.getContext('2d')
    
    cropCanvas.width = Math.round(scaledROI.width)
    cropCanvas.height = Math.round(scaledROI.height)
    
    // Draw the cropped region from the original image
    cropCtx.drawImage(
      imageRef.current,
      Math.round(scaledROI.x),
      Math.round(scaledROI.y),
      Math.round(scaledROI.width),
      Math.round(scaledROI.height),
      0,
      0,
      cropCanvas.width,
      cropCanvas.height
    )
    
    // Convert cropped canvas to blob URL
    cropCanvas.toBlob((blob) => {
      if (blob) {
        const croppedImageUrl = URL.createObjectURL(blob)
        // Save ROI, cropped image, and DPO
        onROIUpdate(scaledROI, croppedImageUrl)
        onDPOUpdate(dpo)
        // Clear painted pixels since we're now showing the cropped image
        setPaintedPixels(new Set())
      }
    }, 'image/png')
  }

  const handleReset = () => {
    if (onResetROI) {
      onResetROI()
      setPaintedPixels(new Set())
      setHistory([])
    }
  }

  if (!image) {
    return (
      <div className="image-canvas-container">
        <div className="no-image">No image selected</div>
      </div>
    )
  }

  return (
    <div className="image-canvas-container">
      <div className="canvas-header">
        <h3>Paint ROI (Region of Interest)</h3>
        <div className="toolbar">
          {!image.croppedImageUrl && (
            <>
              <div className="mode-selector">
                <button
                  className={mode === 'paint' ? 'active' : ''}
                  onClick={() => setMode('paint')}
                >
                  Paint
                </button>
                <button
                  className={mode === 'erase' ? 'active' : ''}
                  onClick={() => setMode('erase')}
                >
                  Eraser
                </button>
              </div>
              <div className="brush-size">
                <label>Brush Size:</label>
                <input
                  type="range"
                  min="5"
                  max="50"
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                />
                <span>{brushSize}px</span>
              </div>
            </>
          )}
          <div className="action-buttons">
            {!image.croppedImageUrl ? (
              <>
                <button onClick={handleUndo} disabled={history.length === 0} className="undo-button">
                  Undo
                </button>
                <button onClick={handleClearROI} className="clear-button">
                  Clear
                </button>
                <button onClick={handleSaveROI} disabled={paintedPixels.size === 0} className="save-button">
                  Save ROI
                </button>
              </>
            ) : (
              <button onClick={handleReset} className="reset-button">
                Reset ROI
              </button>
            )}
          </div>
        </div>
      </div>
      
      <div ref={containerRef} className="canvas-wrapper">
        <canvas
          ref={canvasRef}
          style={{ position: 'absolute', top: 0, left: 0 }}
        />
        {!image.croppedImageUrl && (
          <canvas
            ref={overlayCanvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              cursor: mode === 'paint' ? 'crosshair' : mode === 'erase' ? 'grab' : 'default',
              pointerEvents: 'auto'
            }}
          />
        )}
      </div>

      <div className="image-info">
        <div className="dpo-input">
          <label>DPO (Days Past Ovulation):</label>
          <input
            type="number"
            value={dpo}
            onChange={handleDPOChange}
            placeholder="Enter DPO"
            min="0"
          />
        </div>
        
        {image.rgb && (
          <div className="rgb-display">
            <strong>Average RGB:</strong> R: {image.rgb.r.toFixed(2)}, G: {image.rgb.g.toFixed(2)}, B: {image.rgb.b.toFixed(2)}
          </div>
        )}
      </div>
    </div>
  )
}

export default ImageCanvas

