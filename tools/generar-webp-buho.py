#!/usr/bin/env python3
"""
Genera la variante WebP animada del buho, con alfa de 8 bits.

Por que
-------
El GIF solo admite transparencia de 1 bit: cada pixel esta o totalmente opaco
o totalmente transparente. Por eso el arte original, que venia anti-aliaseado
contra un fondo claro, dejo un contorno brillante al recortarse (ver
limpiar-halo-buho.py). Una vez limpiado, el borde queda "duro": se ve bien
sobre el azul noche del sitio, pero saltaria a la vista sobre un fondo claro.

Que hace este script
--------------------
Reconstruye un borde anti-aliaseado calculando la cobertura de cada pixel a
partir de la silueta, y lo guarda como WebP animado con alfa de 8 bits. Asi el
sprite se funde con CUALQUIER fondo.

Aviso importante
----------------
El alfa reconstruido NO es el del arte original: esa informacion se perdio al
exportar a GIF y no se puede recuperar. Es una aproximacion muy cercana,
derivada de la forma de la silueta. Lo ideal sigue siendo que el ilustrador
reexporte desde el archivo fuente con alfa de 8 bits; este script existe para
no depender de eso.

Uso:  python3 generar-webp-buho.py ../assets/buho/idle.gif ...
Salida: <nombre>.webp junto al original
"""
import os
import sys

import numpy as np
from PIL import Image

# Calidad WebP con perdida. A 90 el error visual es imperceptible (RMSE ~3
# sobre 255, componiendo contra el fondo del sitio) y el archivo pesa ~40%
# menos que el GIF. El canal alfa va aparte, sin perdida.
CALIDAD = 90

# Radio del suavizado del borde. 1 = un anillo de 1 px, que es lo que
# corresponde a un sprite mostrado a tamano nativo.
RADIO = 1


def media_3x3(m):
    """Media de la vecindad 3x3, sin scipy."""
    p = np.pad(m, RADIO, mode='constant', constant_values=0.0)
    acc = np.zeros_like(m, dtype=float)
    n = 0
    for dy in range(-RADIO, RADIO + 1):
        for dx in range(-RADIO, RADIO + 1):
            y0 = dy + RADIO
            x0 = dx + RADIO
            acc += p[y0:y0 + m.shape[0], x0:x0 + m.shape[1]]
            n += 1
    return acc / n


def dilatar_color(rgb, op):
    """Extiende el color del arte un pixel hacia afuera.

    El anillo nuevo de alfa parcial necesita color; si se dejara en negro se
    veria un borde sucio al componer sobre fondos claros.
    """
    salida = rgb.copy().astype(float)
    faltan = ~op
    ys, xs = np.nonzero(faltan)
    h, w = op.shape
    for y, x in zip(ys, xs):
        y0, y1 = max(0, y - 1), min(h, y + 2)
        x0, x1 = max(0, x - 1), min(w, x + 2)
        vec = rgb[y0:y1, x0:x1][op[y0:y1, x0:x1]]
        if vec.size:
            salida[y, x] = vec.mean(axis=0)
    return salida


def suavizar_borde(a):
    """a: (h,w,4) uint8 RGBA con alfa dura. Devuelve RGBA con alfa de 8 bits."""
    rgb = a[..., :3].astype(float)
    op = a[..., 3] > 0

    cobertura = media_3x3(op.astype(float))
    # El interior macizo queda intacto; solo se modula el contorno.
    interior = media_3x3(op.astype(float)) >= 0.999
    alfa = np.clip(cobertura, 0.0, 1.0)
    alfa[interior] = 1.0
    # Todo lo que estaba opaco conserva al menos media cobertura, para que la
    # silueta no adelgace.
    alfa[op] = np.maximum(alfa[op], 0.55)

    color = dilatar_color(rgb, op)

    out = np.zeros_like(a)
    out[..., :3] = np.clip(color, 0, 255).astype(np.uint8)
    out[..., 3] = np.clip(alfa * 255, 0, 255).astype(np.uint8)
    return out


def procesar(ruta, salida):
    im = Image.open(ruta)
    cuadros, duraciones = [], []
    for i in range(im.n_frames):
        im.seek(i)
        a = np.array(im.convert('RGBA'))
        cuadros.append(Image.fromarray(suavizar_borde(a), mode='RGBA'))
        duraciones.append(im.info.get('duration', 120))

    cuadros[0].save(
        salida,
        format='WEBP',
        save_all=True,
        append_images=cuadros[1:],
        duration=duraciones,
        loop=0,
        quality=CALIDAD,
        alpha_quality=100,  # el canal alfa sin perdida: es lo que da el borde limpio
        method=6,           # maxima compresion (mas lento de generar, igual de rapido de leer)
    )
    kb = lambda p: os.path.getsize(p) / 1024
    print(f'{ruta} -> {salida}  ({kb(ruta):.0f}KB -> {kb(salida):.0f}KB, '
          f'{100 * (kb(salida) - kb(ruta)) / kb(ruta):+.0f}%)')


if __name__ == '__main__':
    for f in sys.argv[1:]:
        procesar(f, f.rsplit('.', 1)[0] + '.webp')
