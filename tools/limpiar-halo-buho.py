#!/usr/bin/env python3
"""
Quita el halo claro del contorno de los GIF del buho.

El arte se anti-aliaseo contra un fondo claro (crema ~244,236,219) y el GIF
solo admite transparencia de 1 bit: los pixeles de mezcla del borde quedaron
totalmente opacos conservando el color del fondo viejo. Sobre el azul noche
del sitio eso se ve como un contorno brillante, y como ese contorno cambia de
sitio en cada cuadro, se percibe como centelleo (lo que parecia "lag").

Criterio: un pixel del contorno es artefacto si es bastante mas claro que el
arte que tiene pegado al lado.
  - mucho mas claro -> era casi todo fondo: se vuelve transparente.
  - algo mas claro  -> era mayormente arte: se reemplaza por el color local.

Uso:  python3 limpiar_halo.py idle.gif review.gif wave.gif
Salida: <nombre>.limpio.gif
"""
import sys
import numpy as np
from PIL import Image

BORRAR = 70      # delta de luminancia por encima del cual el pixel se elimina
OSCURECER = 32   # delta a partir del cual se reemplaza por el color vecino
PASADAS = 2      # para halos de mas de 1 pixel de ancho
TRANSP = 255     # indice reservado para transparencia


def lum(rgb):
    return 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]


def rellenar_agujeros(a):
    """Tapa los pixeles transparentes que quedaron ENCERRADOS dentro del buho.

    Salen del umbral de alfa de 1 bit: el anti-aliasing de las lineas oscuras
    (cejas, contorno de los ojos) cayo por debajo del umbral y quedo totalmente
    transparente, dejando pasar el fondo de la pagina. Como cambian de cuadro a
    cuadro, se ven como motas que parpadean justo en la cara.
    """
    a = a.copy()
    h, w = a.shape[:2]
    transp = a[..., 3] == 0

    # flood fill desde los bordes: lo que queda sin marcar es agujero interno
    exterior = np.zeros_like(transp)
    pila = [(y, x) for x in range(w) for y in (0, h - 1) if transp[y, x]]
    pila += [(y, x) for y in range(h) for x in (0, w - 1) if transp[y, x]]
    for y, x in pila:
        exterior[y, x] = True
    pila = list(pila)
    while pila:
        y, x = pila.pop()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and transp[ny, nx] and not exterior[ny, nx]:
                exterior[ny, nx] = True
                pila.append((ny, nx))

    agujeros = transp & ~exterior
    rellenados = 0
    # se rellena de afuera hacia adentro hasta que no quede ninguno
    while agujeros.any():
        op = a[..., 3] > 0
        ys, xs = np.nonzero(agujeros)
        avance = False
        for y, x in zip(ys, xs):
            y0, y1 = max(0, y - 1), min(h, y + 2)
            x0, x1 = max(0, x - 1), min(w, x + 2)
            vecinos = a[y0:y1, x0:x1][op[y0:y1, x0:x1]]
            if vecinos.size == 0:
                continue
            a[y, x, :3] = np.median(vecinos[:, :3], axis=0).astype(np.int16)
            a[y, x, 3] = 255
            agujeros[y, x] = False
            rellenados += 1
            avance = True
        if not avance:
            break

    return a, rellenados


def leer_cuadros(ruta):
    im = Image.open(ruta)
    cuadros, duraciones = [], []
    for i in range(im.n_frames):
        im.seek(i)
        cuadros.append(np.array(im.convert('RGBA')).astype(np.int16))
        duraciones.append(im.info.get('duration', 120))
    return cuadros, duraciones


def limpiar(a):
    """a: (h,w,4) int16 RGBA. Devuelve (limpio, n_borrados, n_reemplazados)."""
    a = a.copy()
    h, w = a.shape[:2]
    borrados = reemplazados = 0

    for _ in range(PASADAS):
        alpha = a[..., 3]
        op = alpha > 0
        pad = np.pad(op, 1, constant_values=False)
        borde = op & ~(pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:])
        L = lum(a[..., :3])
        ys, xs = np.nonzero(borde)
        pendientes = []

        for y, x in zip(ys, xs):
            y0, y1 = max(0, y - 1), min(h, y + 2)
            x0, x1 = max(0, x - 1), min(w, x + 2)
            vop = op[y0:y1, x0:x1].ravel()
            vbo = borde[y0:y1, x0:x1].ravel()
            vL = L[y0:y1, x0:x1].ravel()
            vRGB = a[y0:y1, x0:x1, :3].reshape(-1, 3)

            # referencia: vecinos opacos que NO son contorno (arte "de verdad")
            sel = vop & ~vbo
            if not sel.any():
                sel = vop
            if not sel.any():
                continue

            ref_L = np.median(vL[sel])
            delta = L[y, x] - ref_L
            if delta > BORRAR:
                pendientes.append((y, x, None))
            elif delta > OSCURECER:
                cand = vRGB[sel]
                elegido = cand[np.argmin(np.abs(vL[sel] - ref_L))]
                pendientes.append((y, x, elegido))

        for y, x, val in pendientes:
            if val is None:
                a[y, x] = [0, 0, 0, 0]
                borrados += 1
            else:
                a[y, x, :3] = val
                reemplazados += 1

    return a, borrados, reemplazados


def paleta_global(cuadros):
    """Una sola paleta de 255 colores para todos los cuadros (indice 255 = transparente)."""
    opacos = np.concatenate([c[..., :3][c[..., 3] > 0] for c in cuadros]).astype(np.uint8)
    muestra = Image.fromarray(opacos.reshape(-1, 1, 3), mode='RGB')
    pal_img = muestra.quantize(colors=255, method=Image.Quantize.MAXCOVERAGE)
    pal = pal_img.getpalette()[: 255 * 3]
    return pal_img, pal


def procesar(ruta, salida):
    cuadros, duraciones = leer_cuadros(ruta)
    limpios, tb, tr, tf = [], 0, 0, 0
    for a in cuadros:
        a, f1 = rellenar_agujeros(a)     # tapar motas internas
        c, b, r = limpiar(a)             # quitar el halo del contorno
        c, f2 = rellenar_agujeros(c)     # por si la limpieza abrio alguna nueva
        limpios.append(c)
        tb += b
        tr += r
        tf += f1 + f2

    pal_img, pal = paleta_global(limpios)
    salida_frames = []
    for a in limpios:
        rgb = Image.fromarray(a[..., :3].astype(np.uint8), mode='RGB')
        q = rgb.quantize(palette=pal_img, dither=Image.Dither.NONE)
        idx = np.array(q, dtype=np.uint8)
        idx[a[..., 3] == 0] = TRANSP
        p = Image.fromarray(idx, mode='P')
        p.putpalette(pal + [0, 0, 0])  # 256a entrada: la transparente
        salida_frames.append(p)

    salida_frames[0].save(
        salida,
        save_all=True,
        append_images=salida_frames[1:],
        duration=duraciones,
        loop=0,
        disposal=2,
        transparency=TRANSP,
        optimize=False,
    )
    print(f'{ruta} -> {salida}: {tb} px de halo eliminados, {tr} reemplazados, {tf} agujeros internos tapados')


if __name__ == '__main__':
    for f in sys.argv[1:]:
        procesar(f, f.replace('.gif', '.limpio.gif'))
