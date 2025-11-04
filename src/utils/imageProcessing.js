/**
 * Process an image to detect the test line and calculate average RGB
 * For cropped images, processes the entire image (no ROI needed)
 * 
 * @param {string} imageUrl - URL of the image (cropped image)
 * @returns {Promise<Object>} Average RGB values {r, g, b, grayscale, linePixels}
 */
export async function processImage(imageUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    
    img.onload = () => {
      // Create a new canvas and draw the image
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      
      canvas.width = img.width
      canvas.height = img.height
      ctx.drawImage(img, 0, 0)
      
      // Get image data from the entire image (cropped image is already the ROI)
      const imageData = ctx.getImageData(0, 0, img.width, img.height)
      
      // Convert to grayscale, detect line edges, and extract line pixels
      const lineData = detectLineAndExtractPixels(imageData)
      
      // Calculate average RGB from the detected line pixels
      const avgRGB = calculateAverageRGB(lineData.pixels, lineData.coordinates)
      
      resolve(avgRGB)
    }
    
    img.onerror = () => {
      reject(new Error('Failed to load image'))
    }
    
    img.src = imageUrl
  })
}

/**
 * Detect line edges and extract pixels within the line region
 * Focuses on RED channel since test lines are red/pink
 * Uses vertical line-following to continue through faint sections
 */
function detectLineAndExtractPixels(imageData) {
  const { width, height, data } = imageData
  
  // Step 1: Extract pixel data and calculate redness scores
  const pixelData = []
  const rednessScores = [] // Higher score = more red (lower R value relative to background)
  const edgeMargin = 5 // Ignore pixels near edges
  
  for (let y = 0; y < height; y++) {
    pixelData[y] = []
    rednessScores[y] = []
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      const r = data[idx]
      const g = data[idx + 1]
      const b = data[idx + 2]
      
      pixelData[y][x] = { r, g, b, a: data[idx + 3] }
      
      // Calculate redness score for red/pink lines
      // Background is white (R~255, G~255, B~255)
      // Red/pink lines are darker and have R > G and/or R > B
      const avg = (r + g + b) / 3
      
      // Check if pixel is darker than background (likely part of line)
      const isDark = avg < 220
      
      // Check if pixel has red/pink characteristics
      // For red/pink: R should be higher than G and B, or at least comparable
      const redDominance = r > g && r > b
      const pinkish = r > g || (r > b && Math.abs(r - g) < 50)
      
      // Calculate redness score
      let rednessScore = 0
      if (isDark && (redDominance || pinkish)) {
        // Score based on how dark AND how red it is
        // Darker pixels with red dominance get higher scores
        const darknessScore = 255 - avg
        const redScore = redDominance ? (r - Math.min(g, b)) : (r - g + r - b) / 2
        rednessScore = darknessScore + redScore * 0.5
      }
      
      // Penalize edges - set score to 0 near boundaries
      if (x < edgeMargin || x >= width - edgeMargin || y < edgeMargin || y >= height - edgeMargin) {
        rednessScores[y][x] = 0
      } else {
        rednessScores[y][x] = rednessScore
      }
    }
  }
  
  // Step 2: Find the line by scanning vertically
  // For each row, find the x position with the highest redness score
  const lineCenterX = [] // Center x position for each row
  
  // First pass: find best position for each row
  for (let y = edgeMargin; y < height - edgeMargin; y++) {
    let maxScore = 0
    let bestX = null
    
    // Find the x position with highest redness in this row
    for (let x = edgeMargin; x < width - edgeMargin; x++) {
      // Use a small window to average redness (helps with faint lines)
      let windowScore = 0
      const windowSize = 5 // Larger window for better detection
      let count = 0
      for (let dx = -windowSize; dx <= windowSize; dx++) {
        const nx = x + dx
        if (nx >= edgeMargin && nx < width - edgeMargin) {
          windowScore += rednessScores[y][nx]
          count++
        }
      }
      windowScore = count > 0 ? windowScore / count : 0
      
      if (windowScore > maxScore) {
        maxScore = windowScore
        bestX = x
      }
    }
    
    // Only use this position if it has a reasonable redness score
    // Lower threshold for faint lines
    if (maxScore > 5 && bestX !== null) {
      lineCenterX[y] = bestX
    } else {
      lineCenterX[y] = null // Mark as undefined for this row
    }
  }
  
  // Second pass: smooth and interpolate missing positions
  // Use previous/next positions to fill gaps and smooth transitions
  for (let y = edgeMargin; y < height - edgeMargin; y++) {
    if (lineCenterX[y] === null) {
      // Try to interpolate from nearby rows
      let prevX = null
      let nextX = null
      
      // Look backward
      for (let dy = 1; dy <= 10 && y - dy >= edgeMargin; dy++) {
        if (lineCenterX[y - dy] !== null) {
          prevX = lineCenterX[y - dy]
          break
        }
      }
      
      // Look forward
      for (let dy = 1; dy <= 10 && y + dy < height - edgeMargin; dy++) {
        if (lineCenterX[y + dy] !== null) {
          nextX = lineCenterX[y + dy]
          break
        }
      }
      
      // Interpolate if we have both
      if (prevX !== null && nextX !== null) {
        lineCenterX[y] = Math.round((prevX + nextX) / 2)
      } else if (prevX !== null) {
        lineCenterX[y] = prevX
      } else if (nextX !== null) {
        lineCenterX[y] = nextX
      } else {
        // Fallback to center if no nearby data
        lineCenterX[y] = Math.floor(width / 2)
      }
    }
  }
  
  // Third pass: smooth the line center positions (reduce jitter)
  const smoothedCenters = [...lineCenterX]
  const smoothWindow = 3
  for (let y = edgeMargin + smoothWindow; y < height - edgeMargin - smoothWindow; y++) {
    let sum = 0
    let count = 0
    for (let dy = -smoothWindow; dy <= smoothWindow; dy++) {
      if (lineCenterX[y + dy] !== null) {
        sum += lineCenterX[y + dy]
        count++
      }
    }
    if (count > 0) {
      smoothedCenters[y] = Math.round(sum / count)
    }
  }
  
  // Update lineCenterX with smoothed values
  for (let y = edgeMargin; y < height - edgeMargin; y++) {
    if (smoothedCenters[y] !== null) {
      lineCenterX[y] = smoothedCenters[y]
    }
  }
  
  // Step 3: Collect pixels around the detected line center
  // Use adaptive width based on redness scores (simpler approach without complex edge detection)
  const lineCoordinates = []
  const linePixels = []
  const visited = Array(height).fill(null).map(() => Array(width).fill(false))
  
  // Maximum width to search from center
  const maxWidth = 8 // Reasonable width for line detection
  
  for (let y = edgeMargin; y < height - edgeMargin; y++) {
    const centerX = lineCenterX[y]
    if (centerX === undefined || centerX === null) continue
    
    // Get center redness score
    const centerScore = rednessScores[y][centerX] || 0
    if (centerScore < 1) continue // Skip if center has no redness
    
    // Find actual left and right boundaries based on redness drop-off
    let leftBound = centerX
    let rightBound = centerX
    
    // Search left from center - find where redness drops significantly
    for (let dx = 1; dx <= maxWidth; dx++) {
      const x = centerX - dx
      if (x < edgeMargin) break
      
      const score = rednessScores[y][x] || 0
      // Stop if score drops below 30% of center OR below absolute threshold of 2
      if (score < Math.max(2, centerScore * 0.3)) {
        leftBound = centerX - dx + 1
        break
      }
      leftBound = x
    }
    
    // Search right from center
    for (let dx = 1; dx <= maxWidth; dx++) {
      const x = centerX + dx
      if (x >= width - edgeMargin) break
      
      const score = rednessScores[y][x] || 0
      if (score < Math.max(2, centerScore * 0.3)) {
        rightBound = centerX + dx - 1
        break
      }
      rightBound = x
    }
    
    // Collect pixels between left and right bounds
    for (let x = leftBound; x <= rightBound; x++) {
      if (x >= edgeMargin && x < width - edgeMargin && !visited[y][x]) {
        const score = rednessScores[y][x] || 0
        // Use adaptive threshold based on center score - be more selective
        const threshold = Math.max(2, centerScore * 0.25) // Higher threshold to avoid noise
        
        if (score > threshold) {
          visited[y][x] = true
          lineCoordinates.push({ x, y })
          linePixels.push(pixelData[y][x])
        }
      }
    }
  }
  
  // If we found very few pixels, try a more aggressive approach
  if (linePixels.length < height * 0.1) {
    // Fallback: use pixels with highest redness scores
    const allPixelsWithScore = []
    for (let y = edgeMargin; y < height - edgeMargin; y++) {
      for (let x = edgeMargin; x < width - edgeMargin; x++) {
        if (rednessScores[y][x] > 0) {
          allPixelsWithScore.push({
            score: rednessScores[y][x],
            pixel: pixelData[y][x],
            x,
            y
          })
        }
      }
    }
    allPixelsWithScore.sort((a, b) => b.score - a.score)
    const topCount = Math.max(1, Math.floor(allPixelsWithScore.length * 0.15))
    const topPixels = allPixelsWithScore.slice(0, topCount)
    return {
      pixels: topPixels.map(p => p.pixel),
      coordinates: topPixels.map(p => ({ x: p.x, y: p.y }))
    }
  }
  
  return {
    pixels: linePixels,
    coordinates: lineCoordinates
  }
}


/**
 * Calculate average RGB from pixel data
 */
function calculateAverageRGB(pixels, coordinates) {
  if (pixels.length === 0) {
    return { 
      r: 0, 
      g: 0, 
      b: 0, 
      grayscale: 0,
      linePixels: []
    }
  }
  
  let sumR = 0
  let sumG = 0
  let sumB = 0
  
  pixels.forEach(pixel => {
    sumR += pixel.r
    sumG += pixel.g
    sumB += pixel.b
  })
  
  const avgR = sumR / pixels.length
  const avgG = sumG / pixels.length
  const avgB = sumB / pixels.length
  
  // Calculate grayscale average using luminance formula
  const grayscale = avgR * 0.299 + avgG * 0.587 + avgB * 0.114
  
  return {
    r: avgR,
    g: avgG,
    b: avgB,
    grayscale: grayscale,
    linePixels: coordinates || []
  }
}

