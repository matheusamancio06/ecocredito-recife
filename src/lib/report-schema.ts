import { z } from "zod";

// Coordenada vazia ou ausente precisa falhar: `z.coerce.number()` transformaria "" em 0.
const coordinate = z.preprocess(
  (value) => (typeof value === "string" && value.trim() !== "" ? Number(value) : undefined),
  z.number().finite(),
);

export const reportSchema = z.object({
  lat: coordinate,
  lng: coordinate,
});
