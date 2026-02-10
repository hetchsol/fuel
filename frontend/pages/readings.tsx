import { authFetch, BASE } from '../lib/api'
import { useState } from 'react'


export default function Readings() {
  const [formData, setFormData] = useState({
    nozzleId: 'N001',
    kind: 'Opening',
    manualValue: '',
    ocrConfMin: '0.85',
  })
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string>('')
  const [attachmentId, setAttachmentId] = useState<string>('')
  const [uploading, setUploading] = useState(false)
  const [ocrPreview, setOcrPreview] = useState<any>(null)
  const [loadingOcrPreview, setLoadingOcrPreview] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [validationStatus, setValidationStatus] = useState<'none' | 'match' | 'mismatch'>('none')

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      setSelectedFile(file)
      setUploadedImageUrl('')
      setAttachmentId('')

      // Automatically upload and extract OCR
      await handleUpload(file)
    }
  }

  const handleUpload = async (file: File) => {
    if (!file) {
      setError('Please select an image first')
      return
    }

    setUploading(true)
    setError('')
    setOcrPreview(null)
    setValidationStatus('none') // Reset validation when new image uploaded

    try {
      // Step 1: Upload image
      const uploadFormData = new FormData()
      uploadFormData.append('file', file)

      const uploadRes = await authFetch(`${BASE}/attachments`, {
        method: 'POST',
        body: uploadFormData,
      })

      if (!uploadRes.ok) {
        throw new Error(`Upload failed: ${uploadRes.statusText}`)
      }

      const uploadData = await uploadRes.json()
      setAttachmentId(uploadData.attachment_id)
      setUploadedImageUrl(`${BASE}${uploadData.url}`)

      // Step 2: Get OCR preview
      setLoadingOcrPreview(true)
      const ocrRes = await authFetch(`${BASE}/ocr/preview/${uploadData.attachment_id}`, {
        method: 'POST',
      })

      if (ocrRes.ok) {
        const ocrData = await ocrRes.json()
        setOcrPreview(ocrData)
        setValidationStatus('none') // Reset validation when new image uploaded
      }

      setError('')
    } catch (err: any) {
      setError(err.message || 'Failed to upload image')
    } finally {
      setUploading(false)
      setLoadingOcrPreview(false)
    }
  }

  const handleValidate = () => {
    if (!ocrPreview?.ocr_value || !formData.manualValue) {
      setError('Please ensure both OCR preview and manual value are available')
      return
    }

    const manualVal = parseFloat(formData.manualValue)
    const ocrVal = ocrPreview.ocr_value
    const discrepancy = Math.abs(manualVal - ocrVal)

    // Check if values match within tolerance (±0.2L or 5%)
    const tolerance = Math.max(0.2, ocrVal * 0.05)

    if (discrepancy <= tolerance) {
      setValidationStatus('match')
      setError('')
    } else {
      setValidationStatus('mismatch')
      setError('')
    }
  }

  const calculateDiscrepancy = () => {
    if (!ocrPreview?.ocr_value || !formData.manualValue) return null
    return Math.abs(parseFloat(formData.manualValue) - ocrPreview.ocr_value)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setResult(null)

    try {
      const payload: any = {
        kind: formData.kind,
        manual_value: parseFloat(formData.manualValue),
        ocr_conf_min: parseFloat(formData.ocrConfMin),
      }

      if (attachmentId) {
        payload.attachment_id = attachmentId
      }

      const res = await authFetch(`${BASE}/nozzles/${formData.nozzleId}/readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        throw new Error(`Error: ${res.statusText}`)
      }

      const data = await res.json()
      setResult(data)

      // Reset form after successful submission
      setSelectedFile(null)
      setUploadedImageUrl('')
      setAttachmentId('')
    } catch (err: any) {
      setError(err.message || 'Failed to submit reading')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Submit Dual Meter Reading</h1>
        <p className="mt-2 text-sm text-gray-600">Record Electronic and Mechanical nozzle readings with dual verification</p>
        <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-sm text-blue-900 font-medium">Dual Reading System:</p>
          <ul className="text-xs text-blue-700 mt-1 space-y-1">
            <li>• <strong>Electronic Reading</strong> - Primary precise reading (3 decimal places) - Manually entered</li>
            <li>• <strong>Mechanical Reading</strong> - Backup reading (whole numbers) - Extracted from meter photo via OCR</li>
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Reading Form</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nozzle ID
              </label>
              <input
                type="text"
                value={formData.nozzleId}
                onChange={(e) => setFormData({ ...formData, nozzleId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., N001"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reading Type
              </label>
              <select
                value={formData.kind}
                onChange={(e) => setFormData({ ...formData, kind: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option>Opening</option>
                <option>Closing</option>
                <option>PreSale</option>
                <option>PostSale</option>
              </select>
            </div>

            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 bg-gray-50">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                📷 Upload Nozzle Image (Auto-extracts number)
              </label>
              <div className="space-y-3">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                {uploading && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded">
                    <p className="text-sm text-blue-700">🔍 Uploading and extracting numbers...</p>
                  </div>
                )}
                {uploadedImageUrl && (
                  <div className="mt-2 space-y-3">
                    <p className="text-sm text-green-600 font-medium">✓ Image uploaded and OCR completed</p>
                    <img src={uploadedImageUrl} alt="Uploaded nozzle reading" className="max-w-full h-auto rounded border" />
                  </div>
                )}
              </div>
            </div>

            {/* Mechanical Reading (OCR Extracted) - Always Visible */}
            <div className="bg-indigo-50 border-2 border-indigo-200 rounded-lg p-3">
              <label className="block text-sm font-bold text-indigo-900 mb-1">
                🔧 Mechanical Reading (Backup Meter - OCR Extracted)
              </label>
              <input
                type="text"
                value={ocrPreview?.success ? ocrPreview.ocr_value.toFixed(0) : ''}
                readOnly
                className="w-full px-3 py-2 border border-indigo-300 rounded-md bg-indigo-100 text-indigo-900 text-lg font-bold cursor-not-allowed"
                placeholder="Upload meter photo to extract"
              />
              {ocrPreview?.success && (
                <p className="text-xs text-green-700 mt-1 font-medium">
                  ✓ Confidence: {((ocrPreview.confidence || 0) * 100).toFixed(0)}% | Method: Real OCR
                </p>
              )}
              {ocrPreview && !ocrPreview.success && (
                <p className="text-xs text-yellow-700 mt-1">
                  ⚠️ {ocrPreview.message || 'OCR extraction failed'}
                </p>
              )}
              <p className="text-xs text-indigo-600 mt-2">
                This is the MECHANICAL reading extracted from the meter photo (whole numbers only)
              </p>
            </div>

            {/* Electronic Reading (Primary) */}
            <div className="bg-green-50 border-2 border-green-200 rounded-lg p-3">
              <label className="block text-sm font-bold text-green-900 mb-1">
                ⚡ Electronic Reading (Primary - Precise to 3 decimals)
              </label>
              <input
                type="number"
                step="0.001"
                value={formData.manualValue}
                onChange={(e) => {
                  setFormData({ ...formData, manualValue: e.target.value })
                  setValidationStatus('none') // Reset validation when manual value changes
                }}
                className="w-full px-3 py-2 border border-green-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500 text-lg font-semibold"
                placeholder="e.g., 12345.678"
                required
              />
              <p className="text-xs text-green-600 mt-2">
                Manually enter the ELECTRONIC reading from the digital display (3 decimal places)
              </p>
            </div>

            {/* Validate Button - Always Visible */}
            <div>
              <button
                type="button"
                onClick={handleValidate}
                disabled={!ocrPreview?.success || !formData.manualValue}
                className="w-full px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🔍 Validate Electronic vs Mechanical Reading
              </button>

                {/* Validation Result */}
                {validationStatus === 'match' && (
                  <div className="mt-3 p-4 bg-green-50 border-2 border-green-500 rounded-md">
                    <div className="flex items-center">
                      <span className="text-2xl mr-3">✅</span>
                      <div>
                        <p className="text-sm font-bold text-green-900">Dual Readings Match!</p>
                        <p className="text-xs text-green-700 mt-1">
                          Mechanical: {ocrPreview.ocr_value.toFixed(0)} | Electronic: {parseFloat(formData.manualValue).toFixed(3)} |
                          Discrepancy: {calculateDiscrepancy()?.toFixed(3)}L
                        </p>
                        <p className="text-xs text-green-600 mt-1">
                          ✓ Dual readings verified. You can now proceed to submit.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {validationStatus === 'mismatch' && (
                  <div className="mt-3 p-4 bg-orange-50 border-2 border-orange-500 rounded-md">
                    <div className="flex items-center">
                      <span className="text-2xl mr-3">⚠️</span>
                      <div>
                        <p className="text-sm font-bold text-orange-900">Dual Reading Discrepancy Detected!</p>
                        <p className="text-xs text-orange-700 mt-1">
                          Mechanical: {ocrPreview.ocr_value.toFixed(0)} | Electronic: {parseFloat(formData.manualValue).toFixed(3)} |
                          Discrepancy: {calculateDiscrepancy()?.toFixed(3)}L
                        </p>
                        <p className="text-xs text-orange-600 mt-1">
                          ⚠️ Please verify both meter readings. Discrepancy will be logged for shift reconciliation.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                OCR Confidence Minimum (0-1)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={formData.ocrConfMin}
                onChange={(e) => setFormData({ ...formData, ocrConfMin: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Minimum confidence level for OCR validation (default: 0.85)
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Submitting...' : 'Submit Reading'}
            </button>
          </form>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Validation Result</h2>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm font-medium text-red-900">Error</p>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-sm font-medium text-blue-900">Reading ID</p>
                <p className="text-sm text-blue-700 mt-1">{result.reading_id}</p>
              </div>

              <div className={`p-4 border rounded-md ${
                result.status === 'ok' ? 'bg-green-50 border-green-200' :
                result.status === 'warn' ? 'bg-yellow-50 border-yellow-200' :
                'bg-red-50 border-red-200'
              }`}>
                <p className="text-sm font-medium">Status</p>
                <p className="text-lg font-bold mt-1 capitalize">{result.status}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                  <p className="text-xs font-medium text-green-900">⚡ Electronic Reading</p>
                  <p className="text-lg font-bold text-green-700 mt-1">{parseFloat(formData.manualValue).toFixed(3)}</p>
                </div>
                <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-md">
                  <p className="text-xs font-medium text-indigo-900">🔧 Mechanical Reading</p>
                  <p className="text-lg font-bold text-indigo-700 mt-1">{result.ocr_value?.toFixed(0) || 'N/A'}</p>
                </div>
              </div>

              <div className="p-4 bg-gray-50 border border-gray-200 rounded-md">
                <p className="text-sm font-medium text-gray-900">Discrepancy</p>
                <p className="text-lg font-bold text-gray-700 mt-1">{result.discrepancy?.toFixed(3) || '0.000'} liters</p>
              </div>

              <div className="p-3 bg-cyan-50 border border-cyan-200 rounded-md">
                <p className="text-xs font-medium text-cyan-900">OCR Method</p>
                <p className="text-sm text-cyan-700 mt-1">
                  {result.ocr_method === 'real_ocr' && '🎯 Real OCR - Tesseract'}
                  {result.ocr_method === 'simulated' && '🔄 Simulated OCR'}
                  {result.ocr_method === 'no_image' && '📝 No Image - Simulated'}
                </p>
                <p className="text-xs text-cyan-600 mt-1">
                  Confidence: {((result.ocr_confidence || 0) * 100).toFixed(0)}%
                </p>
              </div>

              {result.reasons && result.reasons.length > 0 && (
                <div className="p-4 bg-orange-50 border border-orange-200 rounded-md">
                  <p className="text-sm font-medium text-orange-900 mb-2">Reasons</p>
                  <ul className="list-disc list-inside space-y-1">
                    {result.reasons.map((reason: string, idx: number) => (
                      <li key={idx} className="text-sm text-orange-700">{reason}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {!result && !error && (
            <div className="text-center py-12 text-gray-500">
              Submit a reading to see validation results
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">How the Dual Reading System Works</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• <strong>Step 1:</strong> Take a photo of the MECHANICAL meter (backup meter with whole numbers)</li>
          <li>• <strong>Step 2:</strong> Upload the image - System extracts the mechanical reading using Tesseract OCR</li>
          <li>• <strong>Step 3:</strong> MECHANICAL Reading is displayed in the indigo field (whole numbers)</li>
          <li>• <strong>Step 4:</strong> Manually enter the ELECTRONIC reading from the digital display (3 decimal places)</li>
          <li>• <strong>Step 5:</strong> Click "Validate" to compare Electronic vs Mechanical readings</li>
          <li>• <strong>Step 6:</strong> System shows match/discrepancy status</li>
          <li>• <strong>Step 7:</strong> Submit Dual Reading - Both values are recorded for shift reconciliation</li>
          <li>• <strong>Result:</strong> Returns status (VALID/warn/error) with full discrepancy details between both meters</li>
        </ul>
        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-300 rounded">
          <p className="text-xs text-yellow-900 font-semibold mb-1">⚠️ Important - Dual Reading System:</p>
          <p className="text-xs text-yellow-800">
            <strong>Electronic Reading</strong> (Primary) = Precise digital display with 3 decimals<br/>
            <strong>Mechanical Reading</strong> (Backup) = Physical meter with whole numbers only<br/>
            Discrepancies between the two are normal and tracked for shift reconciliation and loss prevention.
          </p>
        </div>
      </div>
    </div>
  )
}
