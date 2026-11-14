package com.mimo.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import com.mimo.app.R
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

// Ported 1:1 from app/globals.css: editorial = cream paper, ink outlines, hard offset shadows, rust accent.

@Immutable
data class MimoColors(
    val paper: Color,
    val card: Color,
    val card2: Color,
    val ink: Color,
    val note: Color,
    val line: Color, // outline colour
    val hard: Color, // offset-shadow colour
    val dots: Color,
    val accent: Color,
)

val Editorial = MimoColors(
    paper = Color(0xFFF5EFE6),
    card = Color(0xFFFBF8F2),
    card2 = Color(0xFFEFE7DA),
    ink = Color(0xFF191614),
    note = Color(0xFF2F6F6A),
    line = Color(0xFF191614),
    hard = Color(0xFF191614),
    dots = Color(0x17191614), // rgb(25 22 20 / 0.09)
    accent = Color(0xFFC8603A),
)

val Night = MimoColors(
    paper = Color(0xFF121110),
    card = Color(0xFF1C1A18),
    card2 = Color(0xFF26231F),
    ink = Color(0xFFF5EFE6),
    note = Color(0xFF7FC4BC),
    line = Color(0x38F5EFE6), // rgb(245 239 230 / 0.22)
    hard = Color(0xFF000000),
    dots = Color(0x0DF5EFE6),
    accent = Color(0xFFC8603A),
)

// The five families from app/layout.tsx (Inter, Anton, Barlow Condensed, Caveat, JetBrains Mono).
// Bundled from google/fonts (OFL). Inter, Caveat and JetBrains Mono are variable fonts: one file, weight set by axis.
@OptIn(ExperimentalTextApi::class)
private fun variable(res: Int, vararg weights: FontWeight) =
    FontFamily(weights.map { Font(res, it, variationSettings = FontVariation.Settings(FontVariation.weight(it.weight))) })

val Inter = variable(R.font.inter, FontWeight.Normal, FontWeight.Medium, FontWeight.SemiBold, FontWeight.Bold)
val Anton = FontFamily(Font(R.font.anton))
val Barlow = FontFamily(Font(R.font.barlow_semibold, FontWeight.SemiBold), Font(R.font.barlow_bold, FontWeight.Bold))
val Caveat = variable(R.font.caveat, FontWeight.Normal)
val Mono = variable(R.font.jetbrains_mono, FontWeight.Normal)

/** The CSS utility classes as text styles: .display, .label-cond, .eyebrow, .note */
object MimoType {
    val display = TextStyle(fontFamily = Anton, fontSize = 40.sp, lineHeight = 38.sp, letterSpacing = (-0.02).em)
    val label = TextStyle(fontFamily = Barlow, fontWeight = FontWeight.Bold, fontSize = 16.sp, letterSpacing = 0.04.em)
    val eyebrow = TextStyle(fontFamily = Mono, fontSize = 12.sp, letterSpacing = 0.08.em)
    val note = TextStyle(fontFamily = Caveat, fontSize = 22.sp, lineHeight = 26.sp)
    val body = TextStyle(fontFamily = Inter, fontSize = 15.sp)
}

val LocalMimo = staticCompositionLocalOf { Editorial }

object Mimo {
    val colors: MimoColors @Composable get() = LocalMimo.current
}

@Composable
fun MimoTheme(dark: Boolean = isSystemInDarkTheme(), accent: Color? = null, content: @Composable () -> Unit) {
    val c = (if (dark) Night else Editorial).let { if (accent != null) it.copy(accent = accent) else it }
    val scheme = (if (dark) darkColorScheme() else lightColorScheme()).copy(
        primary = c.accent, onPrimary = c.paper,
        background = c.paper, onBackground = c.ink,
        surface = c.paper, onSurface = c.ink,
        surfaceVariant = c.card2, outline = c.line,
    )
    CompositionLocalProvider(LocalMimo provides c) {
        MaterialTheme(colorScheme = scheme, typography = MaterialTheme.typography.copy(bodyLarge = MimoType.body)) {
            content()
        }
    }
}

/** .brut: 2.4px ink outline + hard offset shadow (4px, 5px). The shadow is drawn behind, no blur. */
fun Modifier.brut(c: MimoColors, radius: Dp = 14.dp, shadow: Offset = Offset(4f, 5f), shape: Shape = RoundedCornerShape(radius)) =
    drawBehind {
        val r = CornerRadius(radius.toPx())
        drawRoundRect(c.hard, topLeft = Offset(shadow.x.dp.toPx(), shadow.y.dp.toPx()), size = size, cornerRadius = r)
    }
        .background(c.card, shape)
        .border(2.4.dp, c.line, shape)

/** body background: paper with the 22px dotted grid. */
fun Modifier.dottedPaper(c: MimoColors) = background(c.paper).drawBehind {
    val step = 22.dp.toPx()
    val r = 1.1.dp.toPx()
    var y = step / 2
    while (y < size.height) {
        var x = step / 2
        while (x < size.width) {
            drawCircle(c.dots, r, Offset(x, y))
            x += step
        }
        y += step
    }
}

/** "#c8603a" → Color, or null for anything else (the theme's own rust then). */
fun parseAccent(hex: String): Color? =
    Regex("^#([0-9a-fA-F]{6})$").find(hex)?.groupValues?.get(1)?.toLong(16)?.let { Color(0xFF000000 or it) }
