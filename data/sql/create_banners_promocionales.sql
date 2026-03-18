-- ============================================================
-- Tabla: banners_promocionales
-- Bucket Storage requerido: "banners-promocionales" (público)
-- ============================================================

CREATE TABLE IF NOT EXISTS banners_promocionales (
  id           BIGSERIAL PRIMARY KEY,
  titulo       TEXT,
  subtitulo    TEXT,
  imagen_url   TEXT NOT NULL,
  enlace       TEXT,
  orden        INTEGER NOT NULL DEFAULT 0,
  activo       BOOLEAN NOT NULL DEFAULT true,
  fecha_inicio DATE,
  fecha_fin    DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para acelerar consultas ordenadas por posición
CREATE INDEX IF NOT EXISTS idx_banners_orden ON banners_promocionales (orden);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_banners_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_banners_updated_at ON banners_promocionales;
CREATE TRIGGER trg_banners_updated_at
  BEFORE UPDATE ON banners_promocionales
  FOR EACH ROW EXECUTE FUNCTION update_banners_updated_at();

-- ============================================================
-- RLS: acceso público total (sin autenticación requerida)
-- ============================================================
ALTER TABLE banners_promocionales ENABLE ROW LEVEL SECURITY;

-- Lectura pública
CREATE POLICY "banners_public_select"
  ON banners_promocionales
  FOR SELECT
  USING (true);

-- Escritura pública (sin requerir autenticación)
CREATE POLICY "banners_public_insert"
  ON banners_promocionales
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "banners_public_update"
  ON banners_promocionales
  FOR UPDATE
  USING (true);

CREATE POLICY "banners_public_delete"
  ON banners_promocionales
  FOR DELETE
  USING (true);

-- ============================================================
-- Bucket Storage: "banners-promocionales"
-- Ejecutar en el panel de Supabase > Storage o via API:
--
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('banners-promocionales', 'banners-promocionales', true)
-- ON CONFLICT (id) DO NOTHING;
--
-- Policy de lectura pública del bucket:
-- CREATE POLICY "public_read_banners"
--   ON storage.objects FOR SELECT
--   USING ( bucket_id = 'banners-promocionales' );
--
-- Policy de escritura pública (sin autenticación):
-- CREATE POLICY "public_insert_banners"
--   ON storage.objects FOR INSERT
--   WITH CHECK ( bucket_id = 'banners-promocionales' );
--
-- CREATE POLICY "public_delete_banners"
--   ON storage.objects FOR DELETE
--   USING ( bucket_id = 'banners-promocionales' );
-- ============================================================
