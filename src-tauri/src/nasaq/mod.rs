// برج «نسق» — وضع التنسيق: العقود (prompts) والقواعد وأوامر النداءات
// الثلاثة. كل ما يغيّر سلوك النموذج في التنسيق يعيش هنا حصرًا، ولا يستورد
// إلا من shared. البرج المقابل (shadhb) لا يُستورد منه شيء أبدًا.
pub(crate) mod commands;
pub(crate) mod contracts;

#[cfg(test)]
mod tests;
