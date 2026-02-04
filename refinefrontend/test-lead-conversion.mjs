import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('1. Navigating to Lead detail page...');
    await page.goto('http://frontend.merakierp.loc/crm/leads/CRM-LEAD-2026-00002', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    console.log('2. Taking screenshot of Lead page...');
    await page.screenshot({ path: '/tmp/lead-detail-before.png', fullPage: true });
    console.log('   Screenshot saved to /tmp/lead-detail-before.png');
    
    // Wait a moment for the page to fully render
    await page.waitForTimeout(2000);
    
    console.log('3. Looking for Convert to Opportunity button...');
    
    // Try to find the button - it might be in different forms
    const buttonSelectors = [
      'button:has-text("Convert to Opportunity")',
      'button:has-text("Convert")',
      '[data-testid="convert-button"]',
      'button.convert-opportunity'
    ];
    
    let button = null;
    for (const selector of buttonSelectors) {
      try {
        button = await page.waitForSelector(selector, { timeout: 3000 });
        if (button) {
          console.log(`   Found button with selector: ${selector}`);
          break;
        }
      } catch (e) {
        // Try next selector
      }
    }
    
    if (!button) {
      console.log('   Button not found. Taking screenshot of current state...');
      await page.screenshot({ path: '/tmp/lead-detail-no-button.png', fullPage: true });
      console.log('   Screenshot saved to /tmp/lead-detail-no-button.png');
      console.log('   Page title:', await page.title());
      console.log('   Page URL:', page.url());
      
      // Get all button text on the page
      const buttons = await page.$$eval('button', btns => btns.map(b => b.textContent?.trim()));
      console.log('   Available buttons:', buttons);
      
      await browser.close();
      return;
    }
    
    console.log('4. Clicking Convert to Opportunity button...');
    await button.click();
    
    console.log('5. Waiting for confirmation dialog...');
    await page.waitForTimeout(1000);
    
    // Look for confirmation dialog
    const confirmButton = await page.waitForSelector('button:has-text("Convert"), button:has-text("Confirm"), button:has-text("OK")', { timeout: 5000 });
    
    console.log('6. Taking screenshot of confirmation dialog...');
    await page.screenshot({ path: '/tmp/lead-conversion-dialog.png', fullPage: true });
    console.log('   Screenshot saved to /tmp/lead-conversion-dialog.png');
    
    console.log('7. Clicking confirmation button...');
    await confirmButton.click();
    
    console.log('8. Waiting for navigation to Opportunity page...');
    await page.waitForTimeout(3000);
    
    console.log('9. Taking screenshot of result...');
    await page.screenshot({ path: '/tmp/lead-conversion-result.png', fullPage: true });
    console.log('   Screenshot saved to /tmp/lead-conversion-result.png');
    
    console.log('   Final URL:', page.url());
    console.log('   Page title:', await page.title());
    
  } catch (error) {
    console.error('Error during test:', error.message);
    await page.screenshot({ path: '/tmp/lead-conversion-error.png', fullPage: true });
    console.log('   Error screenshot saved to /tmp/lead-conversion-error.png');
  } finally {
    await browser.close();
    console.log('\nTest complete!');
  }
})();
