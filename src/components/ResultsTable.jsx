import './ResultsTable.css'

function ResultsTable({ results }) {
  if (results.length === 0) return null

  const totalRateOfChange = results.length > 1
    ? results[results.length - 1].grayscale - results[0].grayscale
    : 0

  return (
    <div className="results-table-container">
      <h3>Analysis Results</h3>
      <table className="results-table">
        <thead>
          <tr>
            <th>DPO</th>
            <th>Average RGB</th>
            <th>Grayscale Average</th>
            <th>Rate of Change</th>
          </tr>
        </thead>
        <tbody>
          {results.map((result, index) => (
            <tr key={index}>
              <td>{result.dpo}</td>
              <td>
                R: {result.rgb.r.toFixed(2)}, G: {result.rgb.g.toFixed(2)}, B: {result.rgb.b.toFixed(2)}
              </td>
              <td>{result.grayscale.toFixed(2)}</td>
              <td className={result.rateOfChange > 0 ? 'positive' : result.rateOfChange < 0 ? 'negative' : ''}>
                {result.rateOfChange > 0 ? '+' : ''}{result.rateOfChange.toFixed(2)}
              </td>
            </tr>
          ))}
          {results.length > 1 && (
            <tr className="total-row">
              <td colSpan="3"><strong>Total Rate of Change</strong></td>
              <td className={totalRateOfChange > 0 ? 'positive' : totalRateOfChange < 0 ? 'negative' : ''}>
                <strong>{totalRateOfChange > 0 ? '+' : ''}{totalRateOfChange.toFixed(2)}</strong>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export default ResultsTable

