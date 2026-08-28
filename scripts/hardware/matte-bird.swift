// Compile with xcrun swiftc; requires macOS 14+ and Vision.
// This writes an initial mask. Use refine-bird-matte.mjs before publishing:
// white enclosed wing patches can be mistaken for background by Vision.
import Foundation
import Vision
import CoreImage
import CoreGraphics

guard CommandLine.arguments.count == 3 else {
    fatalError("Usage: matte-bird input.png output.png")
}
let input = URL(fileURLWithPath: CommandLine.arguments[1])
let output = URL(fileURLWithPath: CommandLine.arguments[2])
let request = VNGenerateForegroundInstanceMaskRequest()
let handler = VNImageRequestHandler(url: input, options: [:])
try handler.perform([request])
guard let observation = request.results?.first,
      observation.allInstances.count == 1 else {
    fatalError("Expected exactly one bird foreground instance")
}
let mask = try observation.generateScaledMaskForImage(
    forInstances: observation.allInstances, from: handler)
guard let foreground = CIImage(contentsOf: input) else {
    fatalError("Cannot load source image")
}
let result = foreground.applyingFilter("CIBlendWithMask", parameters: [
    kCIInputBackgroundImageKey: CIImage(color: .clear).cropped(to: foreground.extent),
    kCIInputMaskImageKey: CIImage(cvPixelBuffer: mask),
])
try CIContext(options: [.cacheIntermediates: false]).writePNGRepresentation(
    of: result, to: output, format: .RGBA8,
    colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!)
print("Created initial mask; enclosed light feathers still need refinement and visual review.")
