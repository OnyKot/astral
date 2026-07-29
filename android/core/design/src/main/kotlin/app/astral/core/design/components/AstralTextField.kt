package app.astral.core.design.components

import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.VisualTransformation
import app.astral.core.design.theme.AstralBorder
import app.astral.core.design.theme.AstralMuted
import app.astral.core.design.theme.AstralPanel
import app.astral.core.design.theme.AstralText
import app.astral.core.design.theme.AstralViolet

@Composable
fun AstralTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    singleLine: Boolean = true,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        placeholder = placeholder?.let { text -> ({ Text(text) }) },
        singleLine = singleLine,
        visualTransformation = visualTransformation,
        keyboardOptions = keyboardOptions,
        keyboardActions = keyboardActions,
        colors = OutlinedTextFieldDefaults.colors(
            focusedTextColor = AstralText,
            unfocusedTextColor = AstralText,
            focusedContainerColor = AstralPanel.copy(alpha = 0.72f),
            unfocusedContainerColor = AstralPanel.copy(alpha = 0.56f),
            focusedBorderColor = AstralViolet,
            unfocusedBorderColor = AstralBorder,
            focusedLabelColor = AstralViolet,
            unfocusedLabelColor = AstralMuted,
            cursorColor = AstralViolet,
        ),
        modifier = modifier,
    )
}
