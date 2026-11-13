package com.mimo.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.dp
import com.mimo.app.ui.*

// Same four phone tabs as components/Nav.tsx. Screens are placeholders until Phase 3.
private val tabs = listOf("Home", "New", "Library", "Search")

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { MimoTheme { Shell() } }
    }
}

@Composable
private fun Shell() {
    val c = Mimo.colors
    var tab by rememberSaveable { mutableIntStateOf(0) }
    Column(Modifier.fillMaxSize().dottedPaper(c).systemBarsPadding()) {
        Box(Modifier.weight(1f).fillMaxWidth()) { Placeholder(tabs[tab]) }
        TabBar(tab) { tab = it }
    }
}

@Composable
private fun Placeholder(title: String) {
    val c = Mimo.colors
    Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("01 / ${title.uppercase()}", style = MimoType.eyebrow, color = c.accent)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("MUSIC THAT ", style = MimoType.display, color = c.ink)
            // .hl: rust word-block, rotated -1.5deg
            Text(
                "MOVES",
                style = MimoType.display,
                color = c.paper,
                modifier = Modifier
                    .graphicsLayer { rotationZ = -1.5f }
                    .background(c.accent, androidx.compose.foundation.shape.RoundedCornerShape(8.dp))
                    .padding(horizontal = 6.dp),
            )
        }
        Column(Modifier.fillMaxWidth().brut(c).padding(16.dp)) {
            Text("NATIVE SHELL", style = MimoType.label, color = c.ink)
            Text("Phase 0: theme, fonts and tabs. Screens come in Phase 3.", style = MimoType.body, color = c.ink.copy(alpha = 0.7f))
        }
        Text("same look, now in Kotlin", style = MimoType.note, color = c.note)
    }
}

@Composable
private fun TabBar(selected: Int, onSelect: (Int) -> Unit) {
    val c = Mimo.colors
    Row(
        Modifier
            .fillMaxWidth()
            .background(c.paper.copy(alpha = 0.95f))
            .drawBehind { drawLine(c.line, Offset(0f, 0f), Offset(size.width, 0f), 2.4.dp.toPx()) },
    ) {
        tabs.forEachIndexed { i, label ->
            Box(
                Modifier.weight(1f).clickable { onSelect(i) }.padding(vertical = 14.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(label.uppercase(), style = MimoType.label.copy(fontSize = MimoType.label.fontSize * 0.8f),
                    color = if (i == selected) c.accent else c.ink.copy(alpha = 0.55f))
            }
        }
    }
}
