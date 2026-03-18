-- ============================================================
--  TABLAS PARA MÓDULO DE PROMOCIONES DE DESCUENTO
--  Pega este SQL en el editor SQL de Supabase y ejecuta.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. Tabla de porcentajes de descuento disponibles
--    (los que aparecen en el modal "Aplicar Descuento" del POS)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.descuentos_porcentajes (
  id         integer   GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  porcentaje numeric   NOT NULL CHECK (porcentaje > 0 AND porcentaje <= 100),
  etiqueta   text,
  activo     boolean   NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Valores iniciales
INSERT INTO public.descuentos_porcentajes (porcentaje, etiqueta) VALUES
  (10, '10%'),
  (15, '15%'),
  (20, '20%')
ON CONFLICT DO NOTHING;

-- RLS
ALTER TABLE public.descuentos_porcentajes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "descuentos_pct_read_all"
  ON public.descuentos_porcentajes FOR SELECT USING (true);

CREATE POLICY "descuentos_pct_write_auth"
  ON public.descuentos_porcentajes FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');


-- ────────────────────────────────────────────────────────────
-- 2. Tabla de promociones programadas por categoría y mes
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.promociones_descuento (
  id                   integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre               text    NOT NULL,
  categoria            text    NOT NULL,
  porcentaje_descuento numeric NOT NULL CHECK (porcentaje_descuento > 0 AND porcentaje_descuento <= 100),
  fecha_inicio         date    NOT NULL,
  fecha_fin            date    NOT NULL,
  activo               boolean NOT NULL DEFAULT true,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now(),
  CONSTRAINT fechas_validas CHECK (fecha_fin >= fecha_inicio)
);

-- Índices para consultas frecuentes (por fecha y categoría)
CREATE INDEX IF NOT EXISTS idx_promociones_fechas
  ON public.promociones_descuento (fecha_inicio, fecha_fin);

CREATE INDEX IF NOT EXISTS idx_promociones_categoria
  ON public.promociones_descuento (categoria);

CREATE INDEX IF NOT EXISTS idx_promociones_activo
  ON public.promociones_descuento (activo, fecha_inicio, fecha_fin);

-- RLS
ALTER TABLE public.promociones_descuento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "promociones_read_all"
  ON public.promociones_descuento FOR SELECT USING (true);

CREATE POLICY "promociones_write_auth"
  ON public.promociones_descuento FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');


-- ────────────────────────────────────────────────────────────
-- 3. Función helper (opcional): retorna promociones activas hoy
--    Uso: SELECT * FROM get_promociones_activas_hoy();
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_promociones_activas_hoy()
RETURNS TABLE (
  id                   integer,
  nombre               text,
  categoria            text,
  porcentaje_descuento numeric,
  fecha_inicio         date,
  fecha_fin            date
)
LANGUAGE sql STABLE AS $$
  SELECT id, nombre, categoria, porcentaje_descuento, fecha_inicio, fecha_fin
  FROM public.promociones_descuento
  WHERE activo = true
    AND fecha_inicio <= CURRENT_DATE
    AND fecha_fin    >= CURRENT_DATE
  ORDER BY categoria, porcentaje_descuento;
$$;
