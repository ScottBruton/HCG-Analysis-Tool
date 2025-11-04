/**
 * Process an image to detect the test line and calculate average RGB
 * For cropped images, processes the entire image (no ROI needed)
 * 
 * @param {string} imageUrl - URL of the image (cropped image)
 * @returns {Promise<Object>} Average RGB values {r, g, b}
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
      const avgRGB = calculateAverageRGB(lineData)
      
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
  
  // Step 2: Find threshold - use Otsu's method or simple percentile
  // For simplicity, use the median as a threshold point
  const allGrays = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      allGrays.push(grayscaleData[y][x])
    }
  }
  allGrays.sort((a, b) => a - b)
  const median = allGrays[Math.floor(allGrays.length / 2)]
  // Line is darker than background, so use pixels darker than median
  // Adjust threshold to be more selective (darker threshold)
  const threshold = median * 0.7 // Adjust this factor if needed
  
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
  largestRegion.forEach(({ x, y }) => {
    linePixels.push(pixelData[y][x])
  })
  
  // If no large region found (line might be very faint), use darkest pixels
  if (linePixels.length === 0) {
    // Fallback: use darkest 20% of pixels
    const allPixelsWithGray = []
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        allPixelsWithGray.push({
          gray: grayscaleData[y][x],
          pixel: pixelData[y][x]
        })
      }
    }
    allPixelsWithGray.sort((a, b) => a.gray - b.gray)
    const darkestCount = Math.max(1, Math.floor(allPixelsWithGray.length * 0.2))
    return allPixelsWithGray.slice(0, darkestCount).map(p => p.pixel)
  }
  
  return linePixels
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
function calculateAverageRGB(pixels) {
  if (pixels.length === 0) {
    return { r: 0, g: 0, b: 0 }
  }
  
  let sumR = 0
  let sumG = 0
  let sumB = 0
  
  pixels.forEach(pixel => {
    sumR += pixel.r
    sumG += pixel.g
    sumB += pixel.b
  })
  
  return {
    r: sumR / pixels.length,
    g: sumG / pixels.length,
    b: sumB / pixels.length
  }
}

