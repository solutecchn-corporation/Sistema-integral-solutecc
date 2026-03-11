-- Agrega la columna direccion_cliente a la tabla cotizaciones
-- Ejecutar una sola vez en Supabase SQL Editor
ALTER TABLE public.cotizaciones
  ADD COLUMN IF NOT EXISTS direccion_cliente text;
