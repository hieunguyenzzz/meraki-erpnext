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
    
    await page.waitForTimeout(2000);
    
    console.log('2. Filling in login credentials...');
    await page.locator('input').first().fill('Administrator');
    await page.locator('input').nth(1).fill('MerakiErp2025!');
    
    await page.screenshot({ path: '/tmp/login-filled.png', fullPage: true });
    
    console.log('3. Clicking Sign in button...');
    await page.click('button:has-text("Sign in")');
    
    console.log('4. Waiting for login to complete...');
    await page.waitForTimeout(4000);
    
    console.log('   Current URL after login:', page.url());
    await page.screenshot({ path: '/tmp/after-login.png', fullPage: true });
    
    if (page.url().includes('/login')) {
      console.log('   Login failed - still on login page');
      await browser.close();
      return;
    }
    
    console.log('   Login successful!');
    
    console.log('5. Navigating to Lead detail page...');
    await page.goto('http://frontend.merakierp.loc/crm/leads/CRM-LEAD-2026-00002', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    await page.waitForTimeout(2000);
    
    console.log('6. Taking screenshot of Lead detail page...');
    await page.screenshot({ path: '/tmp/lead-detail-before.png', fullPage: true });
    console.log('   Screenshot: /tmp/lead-detail-before.png');
    console.log('   URL:', page.url());
    console.log('   Title:', await page.title());
    
    if (page.url().includes('/login')) {
      console.log('   Redirected to login - authentication issue');
      await browser.close();
      return;
    }
    
    console.log('7. Looking for Convert to Opportunity button...');
    
    // Get all visible text on the page to see what's there
    const pageText = await page.textContent('body');
    console.log('   Page contains "Convert":', pageText?.includes('Convert'));
    console.log('   Page contains "Opportunity":', pageText?.includes('Opportunity'));
    
    // Get all button text
    const buttons = await page.$$eval('button', btns => btns.map(b => b.textContent?.trim()).filter(Boolean));
    console.log('   Available buttons:', buttons);
    
    // Try different selectors
    const buttonSelectors = [
      'button:has-text("Convert to Opportunity")',
      'button:has-text("Convert")',
      '[data-testid="convert-button"]',
      'button.convert-opportunity',
      'button:text-is("Convert")'
    ];
    
    let button = null;
    for (const selector of buttonSelectors) {
      try {
        button = await page.waitForSelector(selector, { timeout: 2000 });
        if (button) {
          console.log(`   Found button with selector: ${selector}`);
          break;
        }
      } catch (e) {
        // Try next
      }
    }
    
    if (!button) {
      console.log('   Convert button not found');
      console.log('   Test incomplete - button may not be implemented yet');
      await browser.close();
      return;
    }
    
    console.log('8. Clicking Convert to Opportunity button...');
    await button.click();
    
    console.log('9. Waiting for confirmation dialog...');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: '/tmp/lead-conversion-dialog.png', fullPage: true });
    console.log('   Dialog screenshot: /tmp/lead-conversion-dialog.png');
    
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
          console.log(`   Found confirm button: ${selector}`);
          break;
        }
      } catch (e) {
        // Try next
      }
    }
    
    if (!confirmButton) {
      console.log('   Confirmation button not found in dialog');
      await browser.close();
      return;
    }
    
    console.log('10. Clicking confirmation button...');
    await confirmButton.click();
    
    console.log('11. Waiting for navigation...');
    await page.waitForTimeout(4000);
    
    console.log('12. Taking screenshot of result...');
    await page.screenshot({ path: '/tmp/lead-conversion-result.png', fullPage: true });
    console.log('    Screenshot: /tmp/lead-conversion-result.png');
    console.log('    Final URL:', page.url());
    console.log('    Expected URL pattern: /crm/opportunities/');
    
    // Check if we're on an opportunity page
    if (page.url().includes('/opportunities/')) {
      console.log('    SUCCESS: Navigated to Opportunity page!');
      
      // Extract opportunity ID from URL
      const match = page.url().match(/\/opportunities\/([^/]+)/);
      if (match) {
        console.log('    Opportunity ID:', match[1]);
      }
    } else {
      console.log('    Note: Not on opportunity page, check screenshot');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    await page.screenshot({ path: '/tmp/lead-conversion-error.png', fullPage: true });
    console.log('Error screenshot: /tmp/lead-conversion-error.png');
  } finally {
    await browser.close();
    console.log('\nTest complete!');
  }
})();
