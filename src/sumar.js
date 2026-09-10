export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método no permitido. Usa POST"
    });
  }

  try {
    const { sumas, cantidad } = req.body;

    const numeroSumas = Number(sumas || 0);
    const numeroCantidad = Number(cantidad || 0);

    if (Number.isNaN(numeroSumas) || Number.isNaN(numeroCantidad)) {
      return res.status(400).json({
        error: "sumas y cantidad deben ser números"
      });
    }

    const total = numeroSumas + numeroCantidad;

    return res.status(200).json({
      total: total
    });

  } catch (error) {
    return res.status(500).json({
      error: "Error realizando la suma"
    });
  }
}