import type { Elements } from 'claude-code'

import type { BandHandlers } from './layout'
import type { DesktopLayout, DesktopSvgs } from './svg'

// the desktop's element table: Svg is here and not on the terminal
export type DesktopTable = Elements['desktop']

// DESIGN 5.8: a row a bar: its glyph, its title, a spacer, the track with the hover layer over it and the strips under it, the
// percentage and the close button. The drawings come ready (svg.ts); this only places them
export function renderDesktopBand(table: DesktopTable, layout: DesktopLayout, svgs: DesktopSvgs, handlers: BandHandlers) {
  const { Box, Text, Button, Svg } = table
  const rows = layout.rows.flatMap((row, i) => {
    const s = svgs[row.id]
    if (!s) return []
    const divider = i > 0 ? [<Svg key={`div-${row.id}`} source={layout.divider} alt={layout.dividerAlt} width={layout.total} height={1} />] : []
    return [
      ...divider,
      <Box key={`bar-${row.id}`} flexDirection="row" alignItems={s.strips.length > 0 ? 'flex-start' : 'center'} gap={1}>
        <Text color={row.glyph.color}>{row.glyph.text}</Text>
        <Text wrap="truncate">{row.title}</Text>
        <Box flexGrow={1} />
        <Box flexDirection="column" flexShrink={0}>
          <Box key={`track-${row.id}`}>
            <Svg source={s.base} alt={s.alt} width={s.width} height={s.height} />
            <Box position="absolute" top={0} left={0}>
              <Svg source={s.hover} alt={s.hoverAlt} width={s.width} height={s.height} isInteractive />
            </Box>
          </Box>
          {s.strips.map(r => (
            <Svg key={r.key} source={r.source} alt={r.alt} width={r.width} height={r.height} />
          ))}
        </Box>
        <Text dimColor>{row.pct.text}</Text>
        <Button key={`hud-close-${row.id}`} plain dimColor label="✕" onPress={() => handlers.close(row.id)} />
      </Box>,
    ]
  })
  // the whole session in one dim line at the bottom
  return layout.metrics ? [...rows, <Text key="hud-metrics" dimColor>{layout.metrics.text}</Text>] : rows
}
