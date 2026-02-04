import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('1. Navigating to login page...');
    await page.goto('http://frontend.merakierp.loc/login', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    console.log('2. Logging in...');
    await page.fill('input[type="text"], input[name="email"], input[name="username"]', 'Administrator');
    await page.fill('input[type="password"], input[name="password"]', 'admin');
    
    await page.screenshot({ path: '/tmp/login-page.png', fullPage: true });
    console.log('   Login page screenshot saved');
    
    await page.click('button:has-text("Sign in")');
    
    console.log('3. Waiting for login to complete...');
    await page.waitForTimeout(3000);
    
    console.log('   Current URL after login:', page.url());
    await page.screenshot({ path: '/tmp/after-login.png', fullPage: true });
    console.log('   After login screenshot saved');
    
    console.log('4. Navigating to Lead detail page...');
    await page.goto('http://frontend.merakierp.loc/crm/leads/CRM-LEAD-2026-00002', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    await page.waitForTimeout(2000);
    
    console.log('5. Taking screenshot of Lead page...');
    await page.screenshot({ path: '/tmp/lead-detail-before.png', fullPage: true });
    console.log('   Screenshot saved to /tmp/lead-detail-before.png');
    
    console.log('   Current URL:', page.url());
    console.log('   Page title:', await page.title());
    
    console.log('6. Looking for Convert to Opportunity button...');
    
    // Get all button text on the page
    const buttons = await page.$$eval('button', btns => btns.map(b => b.textContent?.trim()));
    console.log('   Available buttons:', buttons);
    
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
      console.log('   Convert button not found on page');
      await browser.close();
      return;
    }
    
    console.log('7. Clicking Convert to Opportunity button...');
    await button.click();
    
    console.log('8. Waiting for confirmation dialog...');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/tmp/lead-conversion-dialog.png', fullPage: true });
    console.log('   Dialog screenshot saved');
    
    // Look for confirmation button
    const confirmSelectors = [
      'button:has-text("Convert")',
      'button:has-text("Confirm")',
      'button:has-text("OK")',
      'button:has-text("Yes")'
    ];
    
    let confirmButton = null;
    for (const selector of confirmSelectors) {
      try {
        confirmButton = await page.waitForSelector(selector, { timeout: 2000 });
        if (confirmButton) {
          console.log(`   Found confirm button with selector: ${selector}`);
          break;
        }
      } catch (e) {
        // Try next selector
      }
    }
    
    if (!confirmButton) {
      console.log('   Confirmation button not found');
      await browser.close();
      return;
    }
    
    console.log('9. Clicking confirmation button...');
    await confirmButton.click();
    
    console.log('10. Waiting for navigation to Opportunity page...');
    await page.waitForTimeout(3000);
    
    console.log('11. Taking screenshot of result...');
    await page.screenshot({ path: '/tmp/lead-conversion-result.png', fullPage: true });
    console.log('    Screenshot saved to /tmp/lead-conversion-result.png');
    
    console.log('    Final URL:', page.url());
    console.log('    Page title:', await page.title());
    
  } catch (error) {
    console.error('Error during test:', error.message);
    console.error('Stack:', error.stack);
    await page.screenshot({ path: '/tmp/lead-conversion-error.png', fullPage: true });
    console.log('Error screenshot saved to /tmp/lead-conversion-error.png');
  } finally {
    await browser.close();
    console.log('\nTest complete!');
  }
})();
