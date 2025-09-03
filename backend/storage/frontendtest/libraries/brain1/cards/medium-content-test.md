# Medium Content Card

This card contains a moderate amount of content to test the preview mode with "read more" functionality.

## Introduction
This content should be long enough to trigger the preview mode with a "read more" link. The preview should cut off after a certain height and show the "...read more" indicator.

## Section 1: Display States
The three display states should work as follows:
1. **Collapsed**: Only shows the title and controls
2. **Preview**: Shows limited content with "...read more"  
3. **Expanded**: Shows all content with full scrolling

## Section 2: User Interaction
- Clicking the header toggles between states
- Clicking the arrow button also toggles between states
- The arrow icon changes: ▶ (collapsed) → ▼ (preview) → ▲ (expanded)

## Section 3: Content Behavior
In preview mode, this text should be cut off and show a "read more" link. Clicking "read more" should expand to full view.

## Section 4: Testing Instructions
1. Verify the card starts in preview mode by default
2. Click to collapse - should show only title
3. Click again for preview - should show limited content with "read more"
4. Click "read more" OR click header/arrow to expand fully
5. Click header/arrow again to cycle back to collapsed

This content is designed to test the height-based truncation in preview mode.