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
 * 1. Convert to grayscale
 * 2. Find edges of the line using threshold and gradient
 * 3. Extract pixels within the line boundaries
 * 4. Return those pixels for averaging
 */
function detectLineAndExtractPixels(imageData) {
  const { width, height, data } = imageData
  
  // Step 1: Convert to grayscale and store pixel data
  const grayscaleData = []
  const pixelData = []
  
  for (let y = 0; y < height; y++) {
    grayscaleData[y] = []
    pixelData[y] = []
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      // Convert to grayscale using luminance formula
      const gray = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114
      
      grayscaleData[y][x] = gray
      pixelData[y][x] = {
        r: data[idx],
        g: data[idx + 1],
        b: data[idx + 2],
        a: data[idx + 3]
      }
    }
  }
  
  // Step 2: Find threshold - use percentile approach to find darkest pixels
  // Collect all grayscale values
  const allGrays = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      allGrays.push(grayscaleData[y][x])
    }
  }
  allGrays.sort((a, b) => a - b)
  
  // Use the 15th percentile (darkest 15%) as threshold
  // This should capture the line which is darker than the white background
  // Adjust percentile if needed - lower values = more selective (darker threshold)
  const percentileIndex = Math.floor(allGrays.length * 0.15)
  let threshold = allGrays[percentileIndex] || allGrays[0]
  
  // If threshold is too high (close to white), use a more aggressive threshold
  // Most background should be > 200, so if threshold > 180, use a lower percentile
  if (threshold > 180) {
    const lowerPercentileIndex = Math.floor(allGrays.length * 0.05) // Use 5th percentile
    threshold = allGrays[lowerPercentileIndex] || threshold
  }
  
  // Step 3: Find the largest connected dark region (the line)
  const visited = Array(height).fill(null).map(() => Array(width).fill(false))
  const linePixels = []
  let largestRegion = []
  let largestSize = 0
  
  // Flood fill to find connected dark regions
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!visited[y][x] && grayscaleData[y][x] <= threshold) {
        const region = []
        floodFill(x, y, width, height, grayscaleData, visited, threshold, region)
        
        if (region.length > largestSize) {
          largestSize = region.length
          largestRegion = region
        }
      }
    }
  }
  
  // Step 4: Extract pixels from the largest region (the line)
  const lineCoordinates = []
  largestRegion.forEach(({ x, y }) => {
    linePixels.push(pixelData[y][x])
    lineCoordinates.push({ x, y })
  })
  
  // If no large region found (line might be very faint), use darkest pixels
  if (linePixels.length === 0) {
    // Fallback: use darkest 20% of pixels
    const allPixelsWithGray = []
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        allPixelsWithGray.push({
          gray: grayscaleData[y][x],
          pixel: pixelData[y][x],
          x,
          y
        })
      }
    }
    allPixelsWithGray.sort((a, b) => a.gray - b.gray)
    const darkestCount = Math.max(1, Math.floor(allPixelsWithGray.length * 0.2))
    const darkestPixels = allPixelsWithGray.slice(0, darkestCount)
    return {
      pixels: darkestPixels.map(p => p.pixel),
      coordinates: darkestPixels.map(p => ({ x: p.x, y: p.y }))
    }
  }
  
  return {
    pixels: linePixels,
    coordinates: lineCoordinates
  }
}

/**
 * Flood fill algorithm to find connected dark pixels (the line region)
 */
function floodFill(startX, startY, width, height, grayscaleData, visited, threshold, region) {
  const stack = [{ x: startX, y: startY }]
  
  while (stack.length > 0) {
    const { x, y } = stack.pop()
    
    // Check bounds
    if (x < 0 || x >= width || y < 0 || y >= height) continue
    if (visited[y][x]) continue
    if (grayscaleData[y][x] > threshold) continue
    
    // Mark as visited and add to region
    visited[y][x] = true
    region.push({ x, y })
    
    // Check 4-connected neighbors
    stack.push({ x: x + 1, y })
    stack.push({ x: x - 1, y })
    stack.push({ x, y: y + 1 })
    stack.push({ x, y: y - 1 })
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

